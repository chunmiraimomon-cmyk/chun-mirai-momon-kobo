import { MUSIC_PATTERNS, GOJO_MUSIC_PATTERN, MUSIC_VOICES, raceMusicStep, musicScheduleWindow, musicVoiceEnvelope } from "../lib/race-score.mjs";

export type GameAudioCourseId = "city" | "jungle" | "starlight" | "river" | "cloud" | "pirate" | "custom";
export type GameAudioSkillId = "PIXEL" | "VOLT" | "COMET" | "GIANT";

export type GameAudioEvent =
  | "menu"
  | "countdown"
  | "start"
  | "pickup"
  | "item"
  | "skill"
  | "shield"
  | "drift"
  | "driftTurbo"
  | "turbo"
  | "crash"
  | "hit"
  | "jump"
  | "land"
  | "finish";

type AudioContextConstructor = typeof AudioContext;

type MusicInstrument = keyof typeof MUSIC_VOICES;
const midiRatio = (semitones: number) => Math.pow(2, semitones / 12);

export class GameAudioController {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicDuck: GainNode | null = null;
  private musicReverb: ConvolverNode | null = null;
  private musicDelay: DelayNode | null = null;
  private musicWaves: Partial<Record<MusicInstrument, PeriodicWave>> = {};
  private musicVoices = new Set<{ gain: GainNode; sources: AudioScheduledSourceNode[] }>();
  private windSource: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private raceIntensity = 0;
  private audioPaused = false;
  private musicSceneLevel: GainNode | null = null;
  private effectsGain: GainNode | null = null;
  private effectsReverbInput: ConvolverNode | null = null;
  private effectsReverbGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineOscillators: OscillatorNode[] = [];
  private skidGain: GainNode | null = null;
  private skidFilter: BiquadFilterNode | null = null;
  private skidOscillators: OscillatorNode[] = [];
  private noiseBuffer: AudioBuffer | null = null;
  private schedulerId: number | null = null;
  private courseId: GameAudioCourseId = "city";
  private musicActive = false;
  private gojoBattle = false;
  private musicStep = 0;
  private nextMusicAt = 0;
  private musicNeedsRestart = false;
  private bgmVolume = 0.58;
  private seVolume = 0.78;
  private muted = false;
  private lastEventAt: Partial<Record<GameAudioEvent, number>> = {};
  private lastSkillAt: Partial<Record<GameAudioSkillId, number>> = {};

  async unlock() {
    if (typeof window === "undefined") return;
    const createdGraph = !this.context;
    if (createdGraph) this.createGraph();
    const wasSuspended = this.context?.state === "suspended";
    if (wasSuspended) await this.context?.resume();
    if (this.context?.state === "running" && this.musicActive && (createdGraph || wasSuspended)) {
      this.nextMusicAt = Math.max(this.nextMusicAt, this.context.currentTime + 0.025);
      this.scheduleMusic();
    }
  }

  setLevels(bgmVolume: number, seVolume: number, muted: boolean) {
    this.bgmVolume = Math.max(0, Math.min(1, bgmVolume));
    this.seVolume = Math.max(0, Math.min(1, seVolume));
    this.muted = muted;
    if (!this.context) return;
    const now = this.context.currentTime;
    this.masterGain?.gain.setTargetAtTime(muted ? 0 : 0.82, now, 0.025);
    this.musicGain?.gain.setTargetAtTime(this.bgmVolume * 0.68, now, 0.04);
    this.effectsGain?.gain.setTargetAtTime(this.seVolume * 0.46, now, 0.025);
  }

  setScene(phase: string, courseId: GameAudioCourseId, gojoBattle = false) {
    const nextActive = phase === "countdown" || phase === "racing";
    const changedScore = courseId !== this.courseId || gojoBattle !== this.gojoBattle;
    if (changedScore || (nextActive && !this.musicActive)) {
      this.fadeMusicVoices();
      this.courseId = courseId;
      this.gojoBattle = gojoBattle;
      this.musicStep = 0;
      this.musicNeedsRestart = false;
      if (this.context) this.nextMusicAt = this.context.currentTime + 0.075;
    }
    if (nextActive !== this.musicActive) {
      if (!nextActive) this.fadeMusicVoices();
      this.musicActive = nextActive;
      if (this.context) this.nextMusicAt = this.context.currentTime + 0.075;
    }
    if (this.context) this.musicSceneLevel?.gain.setTargetAtTime(nextActive ? 1 : 0, this.context.currentTime, 0.15);
    if (this.musicActive && this.context?.state === "running") this.scheduleMusic();
  }

  updateVehicle(speedKph: number, racing: boolean, drifting: boolean, boosting: boolean, crashing: boolean,
    telemetry: { finalLap?: boolean; airborne?: boolean; paused?: boolean } = {}) {
    const context = this.context;
    if (!context || !this.engineGain || !this.engineFilter || this.engineOscillators.length < 2) return;
    const now = context.currentTime;
    this.raceIntensity = boosting ? 1 : telemetry.finalLap ? 0.75 : 0.25;
    const paused = Boolean(telemetry.paused);
    if (paused !== this.audioPaused) {
      this.audioPaused = paused;
      this.musicSceneLevel?.gain.setTargetAtTime(paused ? 0.18 : this.musicActive ? 1 : 0, now, 0.12);
    }
    const speed = Math.max(0, Math.min(430, speedKph));
    const throttle = racing && !crashing ? Math.min(1, speed / 285) : 0;
    const gear = Math.min(4, Math.floor(speed / 70));
    const revs = speed - gear * 70;
    const baseFrequency = 38 + revs * 0.45 + gear * 5 + (boosting ? 12 : 0);
    this.engineOscillators[0].frequency.setTargetAtTime(baseFrequency, now, 0.035);
    this.engineOscillators[1].frequency.setTargetAtTime(baseFrequency * (drifting ? 1.56 : 1.49), now, 0.04);
    this.engineFilter.frequency.setTargetAtTime(235 + speed * 2.45 + (boosting ? 190 : 0), now, 0.045);
    const targetGain = racing ? 0.046 + throttle * 0.19 + (boosting ? 0.032 : 0) : 0;
    this.engineGain.gain.setTargetAtTime(targetGain, now, 0.045);
    this.windGain?.gain.setTargetAtTime(racing ? Math.pow(speed / 430, 1.7) * (telemetry.airborne ? 0.15 : 0.09) : 0, now, 0.18);
    this.windFilter?.frequency.setTargetAtTime(320 + speed * 3.2, now, 0.2);
    if (this.skidGain && this.skidFilter && this.skidOscillators.length >= 2) {
      const skidAmount = racing && drifting ? Math.min(1, 0.45 + speed / 240) : 0;
      const warble = 1 + Math.sin(now * 21) * 0.022;
      const skidBase = (102 + speed * 0.31) * warble;
      this.skidOscillators[0].frequency.setTargetAtTime(skidBase, now, 0.045);
      this.skidOscillators[1].frequency.setTargetAtTime(skidBase * 1.47, now, 0.05);
      this.skidGain.gain.setTargetAtTime(0.052 * skidAmount, now, drifting ? 0.035 : 0.075);
      this.skidFilter.frequency.setTargetAtTime(760 + speed * 2.4, now, 0.06);
    }
  }

  play(event: GameAudioEvent) {
    const context = this.context;
    if (!context || context.state !== "running" || !this.effectsGain || this.muted) return;
    const nowMs = performance.now();
    const minimumGap = event === "hit" ? 90 : event === "drift" ? 240 : 25;
    if (nowMs - (this.lastEventAt[event] ?? -10000) < minimumGap) return;
    this.lastEventAt[event] = nowMs;
    const now = context.currentTime;

    if (event === "crash" || event === "turbo" || event === "finish" || event === "skill") this.duckMusic(now, event === "crash" ? 0.55 : 0.78);

    switch (event) {
      case "menu":
        this.tone(now, 210, 260, 0.08, 0.1, "triangle");
        this.metallic(now, 680, 0.12, 0.045);
        break;
      case "countdown":
        this.tone(now, 145, 112, 0.16, 0.25, "sine");
        this.tone(now, 330, 300, 0.12, 0.09, "triangle");
        break;
      case "start":
        this.sweepNoise(now, 0.48, 0.2, 380, 4200, "bandpass");
        this.tone(now, 165, 660, 0.42, 0.25, "sawtooth");
        [0, 7, 12].forEach((step, index) => this.chime(now + index * 0.07, 330 * midiRatio(step), 0.7, 0.095));
        break;
      case "pickup":
        [0, 4, 7, 12].forEach((step, index) => this.chime(now + index * 0.045, 440 * midiRatio(step), 0.32, 0.07));
        break;
      case "item":
        this.sweepNoise(now, 0.3, 0.15, 520, 3400, "bandpass");
        this.tone(now, 180, 470, 0.28, 0.14, "triangle");
        break;
      case "skill":
        [0, 7, 12].forEach((step, index) => this.metallic(now + index * 0.06, 240 * midiRatio(step), 0.32, 0.08));
        break;
      case "shield":
        this.sweepNoise(now, 0.44, 0.12, 3900, 720, "bandpass");
        this.tone(now, 620, 310, 0.42, 0.18, "sine");
        this.metallic(now + 0.03, 980, 0.52, 0.055);
        break;
      case "drift":
        this.tireChirp(now, 0.24, 0.085);
        break;
      case "driftTurbo":
        this.sweepNoise(now, 0.46, 0.22, 420, 3900, "bandpass");
        this.tone(now, 96, 460, 0.38, 0.15, "sawtooth");
        this.metallic(now + 0.035, 760, 0.28, 0.055);
        break;
      case "turbo":
        this.sweepNoise(now, 0.72, 0.28, 260, 5200, "bandpass");
        this.rumble(now, 0.62, 0.16, 95, 48);
        this.tone(now, 92, 540, 0.55, 0.19, "sawtooth");
        break;
      case "crash":
        this.rumble(now, 0.72, 0.32, 120, 38);
        this.sweepNoise(now, 0.5, 0.32, 2400, 330, "bandpass");
        this.metallic(now + 0.025, 250, 0.85, 0.13);
        this.metallic(now + 0.1, 410, 0.62, 0.075);
        this.metallic(now + 0.21, 680, 0.21, 0.028);
        this.metallic(now + 0.36, 510, 0.17, 0.019);
        break;
      case "hit":
        this.rumble(now, 0.24, 0.18, 105, 48);
        this.sweepNoise(now, 0.2, 0.18, 1900, 420, "bandpass");
        this.metallic(now, 310, 0.32, 0.07);
        break;
      case "jump":
        this.bouncyTone(now, 0.46, 0.2);
        break;
      case "land":
        this.rumble(now, 0.24, 0.18, 92, 42);
        this.sweepNoise(now, 0.16, 0.1, 680, 250, "lowpass");
        break;
      case "finish":
        [0, 4, 7, 12, 7, 12, 16, 19].forEach((step, index) => this.chime(now + index * 0.115, 261.63 * midiRatio(step), 0.85, 0.09));
        this.sweepNoise(now, 0.85, 0.14, 440, 4800, "bandpass");
        break;
    }
  }

  playItem(item: string) {
    const context = this.context;
    if (!context || context.state !== "running" || this.muted) return;
    const now = context.currentTime;
    if (item === "BOOST") {
      this.play("turbo");
    } else if (item === "HOMING") {
      this.missileLaunch(now, 0.95);
    } else if (item === "FIRE") {
      this.sweepNoise(now, 0.55, 0.24, 280, 2700, "bandpass");
      this.rumble(now, 0.42, 0.12, 82, 46);
    } else if (item === "SPIKES") {
      this.metallic(now, 180, 0.5, 0.16);
      this.rumble(now, 0.22, 0.13, 96, 43);
    } else if (item === "NOVA") {
      this.rumble(now, 1.15, 0.31, 78, 31);
      this.sweepNoise(now, 0.9, 0.28, 320, 4100, "bandpass");
    } else if (item === "AURORA") {
      [0, 7, 12, 16].forEach((step, index) => this.metallic(now + index * 0.06, 290 * midiRatio(step), 0.65, 0.07));
    } else if (item === "SHIELD") {
      this.play("shield");
    } else {
      this.play("item");
    }
  }

  playSkill(skill: GameAudioSkillId, volumeScale = 1) {
    const context = this.context;
    if (!context || context.state !== "running" || this.muted) return;
    const nowMs = performance.now();
    if (nowMs - (this.lastSkillAt[skill] ?? -10000) < 180) return;
    this.lastSkillAt[skill] = nowMs;
    const now = context.currentTime;
    const scale = Math.max(0.35, Math.min(1, volumeScale));
    if (scale > 0.7) this.duckMusic(now, 0.76);
    if (skill === "PIXEL") {
      this.sweepNoise(now, 0.62, 0.16 * scale, 180, 1900, "bandpass");
      [0, 7, 12].forEach((step, index) => this.metallic(now + index * 0.055, 250 * midiRatio(step), 0.55, 0.09 * scale));
    } else if (skill === "VOLT") {
      [0, 4, 7, 11].forEach((step, index) => this.metallic(now + index * 0.07, 170 * midiRatio(step), 0.72, 0.08 * scale));
      this.rumble(now, 0.48, 0.11 * scale, 64, 42);
    } else if (skill === "COMET") {
      [0, 7, 14].forEach((step, index) => this.metallic(now + index * 0.09, 330 * midiRatio(step), 0.64, 0.11 * scale));
      this.sweepNoise(now, 0.72, 0.12 * scale, 420, 2400, "bandpass");
    } else if (skill === "GIANT") {
      this.bouncyTone(now, 0.58, 0.25 * scale);
      this.sweepNoise(now, 0.42, 0.12 * scale, 260, 1400, "bandpass");
    }
  }

  dispose() {
    if (this.schedulerId !== null && typeof window !== "undefined") window.clearInterval(this.schedulerId);
    this.schedulerId = null;
    this.engineOscillators.forEach((oscillator) => {
      try { oscillator.stop(); } catch { /* already stopped */ }
      oscillator.disconnect();
    });
    this.engineOscillators = [];
    this.skidOscillators.forEach((oscillator) => {
      try { oscillator.stop(); } catch { /* already stopped */ }
      oscillator.disconnect();
    });
    this.skidOscillators = [];
    try { this.windSource?.stop(); } catch { /* stopped */ }
    this.windSource?.disconnect();
    this.windSource = null;
    this.skidGain = null;
    this.skidFilter = null;
    void this.context?.close();
    this.context = null;
    this.musicWaves = {};
    this.musicVoices.clear();
  }

  private createGraph() {
    const WindowWithAudio = window as typeof window & { webkitAudioContext?: AudioContextConstructor };
    const ContextClass = window.AudioContext ?? WindowWithAudio.webkitAudioContext;
    if (!ContextClass) return;
    const context = new ContextClass();
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;
    master.connect(compressor).connect(context.destination);

    const music = context.createGain();
    // Gentle shared roll-off removes brittle percussion/partials without
    // altering the separately routed engine, skill sounds or effects fader.
    const musicLowpass = context.createBiquadFilter();
    musicLowpass.type = "lowpass";
    musicLowpass.frequency.value = 2300;
    musicLowpass.Q.value = 0.55;
    for (const instrument of Object.keys(MUSIC_VOICES) as MusicInstrument[]) {
      const partials = MUSIC_VOICES[instrument].partials;
      this.musicWaves[instrument] = context.createPeriodicWave(new Float32Array(partials.length), new Float32Array(partials));
    }
    const effects = context.createGain();
    const effectsReverbInput = context.createConvolver();
    const effectsReverbGain = context.createGain();
    effectsReverbInput.buffer = this.createImpulseBuffer(context);
    effectsReverbGain.gain.value = 0.16;
    const musicDuck = context.createGain();
    const musicSceneLevel = context.createGain();
    musicSceneLevel.gain.value = this.musicActive ? 1 : 0;
    music.connect(musicLowpass).connect(musicDuck).connect(musicSceneLevel).connect(master);
    const musicReverb = context.createConvolver();
    const musicWet = context.createGain();
    musicReverb.buffer = this.createImpulseBuffer(context);
    musicWet.gain.value = 0.1;
    musicReverb.connect(musicWet).connect(music);
    const musicDelay = context.createDelay(1);
    const delayFeedback = context.createGain();
    const delayLowpass = context.createBiquadFilter();
    const delayWet = context.createGain();
    musicDelay.delayTime.value = 0.304;
    delayFeedback.gain.value = 0.13;
    delayLowpass.type = "lowpass"; delayLowpass.frequency.value = 1500;
    delayWet.gain.value = 0.045;
    musicDelay.connect(delayLowpass).connect(delayFeedback).connect(musicDelay);
    delayLowpass.connect(delayWet).connect(music);
    effects.connect(master);
    effectsReverbInput.connect(effectsReverbGain).connect(effects);
    const engineGain = context.createGain();
    const engineFilter = context.createBiquadFilter();
    engineGain.gain.value = 0;
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 260;
    engineFilter.Q.value = 0.72;
    engineGain.connect(engineFilter).connect(effects);
    const engineA = context.createOscillator();
    const engineB = context.createOscillator();
    engineA.type = "triangle";
    engineB.type = "sawtooth";
    engineA.setPeriodicWave(context.createPeriodicWave(new Float32Array(8), new Float32Array([0, 1, 0.34, 0.19, 0.12, 0.075, 0.04, 0.025])));
    const harmonicGain = context.createGain();
    harmonicGain.gain.value = 0.12;
    engineA.connect(engineGain);
    engineB.connect(harmonicGain).connect(engineGain);
    engineA.start();
    engineB.start();

    const noiseBuffer = this.createNoiseBuffer(context);
    const wind = context.createBufferSource();
    const windFilter = context.createBiquadFilter();
    const windGain = context.createGain();
    wind.buffer = noiseBuffer; wind.loop = true;
    windFilter.type = "lowpass"; windFilter.frequency.value = 500;
    windGain.gain.value = 0;
    wind.connect(windFilter).connect(windGain).connect(effects);
    wind.start();
    const skidFilter = context.createBiquadFilter();
    const skidGain = context.createGain();
    const skidA = context.createOscillator();
    const skidB = context.createOscillator();
    const skidPartialGain = context.createGain();
    skidA.type = "sawtooth";
    skidB.type = "triangle";
    skidA.frequency.value = 110;
    skidB.frequency.value = 162;
    skidPartialGain.gain.value = 0.28;
    skidFilter.type = "bandpass";
    skidFilter.frequency.value = 920;
    skidFilter.Q.value = 3.4;
    skidGain.gain.value = 0;
    skidA.connect(skidFilter);
    skidB.connect(skidPartialGain).connect(skidFilter);
    skidFilter.connect(skidGain).connect(effects);
    skidA.start();
    skidB.start();

    this.context = context;
    this.masterGain = master;
    this.musicGain = music;
    this.musicDuck = musicDuck;
    this.musicSceneLevel = musicSceneLevel;
    this.musicReverb = musicReverb;
    this.musicDelay = musicDelay;
    this.windSource = wind;
    this.windFilter = windFilter;
    this.windGain = windGain;
    this.effectsGain = effects;
    this.effectsReverbInput = effectsReverbInput;
    this.effectsReverbGain = effectsReverbGain;
    this.engineGain = engineGain;
    this.engineFilter = engineFilter;
    this.engineOscillators = [engineA, engineB];
    this.skidOscillators = [skidA, skidB];
    this.skidFilter = skidFilter;
    this.skidGain = skidGain;
    this.noiseBuffer = noiseBuffer;
    this.nextMusicAt = context.currentTime + 0.05;
    this.setLevels(this.bgmVolume, this.seVolume, this.muted);
    this.schedulerId = window.setInterval(() => this.scheduleMusic(), 50);
  }

  private createNoiseBuffer(context: AudioContext) {
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.7), context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) channel[index] = Math.random() * 2 - 1;
    return buffer;
  }

  private createImpulseBuffer(context: AudioContext) {
    const duration = 1.15;
    const buffer = context.createBuffer(2, Math.floor(context.sampleRate * duration), context.sampleRate);
    for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex += 1) {
      const channel = buffer.getChannelData(channelIndex);
      for (let index = 0; index < channel.length; index += 1) {
        const decay = Math.pow(1 - index / channel.length, 2.8);
        channel[index] = (Math.random() * 2 - 1) * decay;
      }
    }
    return buffer;
  }

  private scheduleMusic() {
    const context = this.context;
    if (!context || context.state !== "running" || !this.musicActive || !this.musicGain || this.muted || this.bgmVolume <= 0) {
      if (context && this.musicActive) this.musicNeedsRestart = true;
      if (context) this.nextMusicAt = context.currentTime + 0.06;
      return;
    }
    const pattern = this.gojoBattle ? GOJO_MUSIC_PATTERN : MUSIC_PATTERNS[this.courseId];
    const stepDuration = 60 / pattern.bpm / 2;
    // Pads can have finished during a muted/background interval. Restart a
    // complete phrase, never resume halfway through a now-silent held chord.
    if (this.musicNeedsRestart || this.nextMusicAt < context.currentTime - 0.5) {
      this.fadeMusicVoices();
      this.musicStep = 0;
      this.nextMusicAt = context.currentTime + 0.025;
      this.musicNeedsRestart = false;
    }
    const window = musicScheduleWindow(this.nextMusicAt, context.currentTime, stepDuration);
    this.nextMusicAt = window.start;
    this.musicDelay?.delayTime.setTargetAtTime(stepDuration * 1.5, context.currentTime, 0.15);
    let scheduled = 0;
    while (this.nextMusicAt < context.currentTime + 0.18 && scheduled++ < window.maxSteps) {
      const score = raceMusicStep(this.musicStep, pattern, this.raceIntensity);
      const { energy } = score;
      const mix = pattern.mix;
      const at = this.nextMusicAt + score.offset * stepDuration;
      if (score.lead !== null) {
        this.musicInstrumentTone(
          at,
          pattern.root * midiRatio(score.lead),
          stepDuration * (score.leadSteps - 0.12),
          0.084 * energy * score.leadVelocity * mix.lead,
          pattern.instrument as MusicInstrument,
        );
      }
      if (score.bass !== null) {
        this.musicBass(at, pattern.root * midiRatio(score.bass), stepDuration * score.bassSteps, 0.135 * energy * score.bassVelocity * mix.bass);
      }
      if (score.chordOn) {
        this.musicChord(at, pattern.root, score.voicing, stepDuration * score.chordSteps, 0.019 * energy * mix.pad, pattern.padInstrument as MusicInstrument);
      }
      // No speed-triggered upper melody or periodic cymbal blast. The course
      // score explicitly owns each rhythmic layer, including silence.
      if (score.kick && mix.kick) this.musicKick(at, 0.17 * energy * mix.kick);
      if (score.snare && mix.snare) this.musicSnare(at, 0.063 * energy * mix.snare);
      if (score.hat && mix.hat) this.musicHat(at, 0.009 * mix.hat, 0.075);
      if (score.shaker) this.musicHat(at, 0.0035, 0.09, 1350);
      score.toms.forEach((tom) => this.musicTom(at, tom.frequency, 0.064 * energy * mix.tom * tom.gain));
      this.musicStep += 1;
      this.nextMusicAt += stepDuration;
    }
  }

  private trackMusicVoice(gain: GainNode, sources: AudioScheduledSourceNode[]) {
    const voice = { gain, sources };
    this.musicVoices.add(voice);
    return () => this.musicVoices.delete(voice);
  }

  private fadeMusicVoices() {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.musicVoices.forEach(({ gain, sources }) => {
      if (gain.gain.cancelAndHoldAtTime) gain.gain.cancelAndHoldAtTime(now);
      else gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0.0001, now, 0.012);
      sources.forEach((source) => { try { source.stop(now + 0.06); } catch { /* already ended */ } });
    });
    this.musicVoices.clear();
  }

  private musicInstrumentTone(
    at: number,
    frequency: number,
    duration: number,
    volume: number,
    instrument: MusicInstrument,
  ) {
    const context = this.context;
    if (!context || !this.musicGain) return;
    const profile = MUSIC_VOICES[instrument];
    const envelope = musicVoiceEnvelope(instrument, duration);
    const oscillatorA = context.createOscillator();
    const oscillatorB = context.createOscillator();
    const partialGain = context.createGain();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    const periodicWave = this.musicWaves[instrument];
    if (periodicWave) oscillatorA.setPeriodicWave(periodicWave);
    else oscillatorA.type = "triangle";
    oscillatorB.type = "sine";
    oscillatorA.frequency.value = frequency;
    oscillatorB.frequency.value = frequency;
    oscillatorA.detune.value = -profile.detune;
    oscillatorB.detune.value = profile.detune;
    partialGain.gain.setValueAtTime(profile.colour, at);
    partialGain.gain.exponentialRampToValueAtTime(profile.colour * 0.5, at + duration);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.min(profile.cutoff, Math.max(950, frequency * 4)), at);
    filter.frequency.exponentialRampToValueAtTime(Math.min(profile.cutoff, Math.max(600, Math.min(1300, frequency * 2.2))), at + duration);
    filter.Q.value = 0.55;
    // Normalise the extra partial: richer timbre must not raise the peak budget.
    const registerGain = Math.min(1, Math.pow(330 / Math.max(330, frequency), 0.4));
    const peak = volume * registerGain / (1 + profile.colour);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + envelope.attack);
    gain.gain.exponentialRampToValueAtTime(peak * envelope.sustain, at + envelope.decay);
    gain.gain.setValueAtTime(peak * envelope.sustain, at + envelope.release);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillatorA.connect(filter);
    oscillatorB.connect(partialGain).connect(filter);
    const panner = context.createStereoPanner();
    panner.pan.value = profile.pan;
    filter.connect(gain).connect(panner).connect(this.musicGain);
    if (this.musicReverb) panner.connect(this.musicReverb);
    if (this.musicDelay) panner.connect(this.musicDelay);
    oscillatorA.start(at);
    oscillatorB.start(at);
    oscillatorA.stop(at + duration + 0.025);
    oscillatorB.stop(at + duration + 0.025);
    const untrack = this.trackMusicVoice(gain, [oscillatorA, oscillatorB]);
    oscillatorA.onended = () => {
      untrack();
      oscillatorA.disconnect(); oscillatorB.disconnect(); partialGain.disconnect(); filter.disconnect(); gain.disconnect(); panner.disconnect();
    };
  }

  private musicBass(at: number, frequency: number, duration: number, volume: number) {
    const context = this.context;
    if (!context || !this.musicGain) return;
    const sine = context.createOscillator();
    const body = context.createOscillator();
    const bodyGain = context.createGain();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    sine.type = "sine";
    body.type = "triangle";
    sine.frequency.value = frequency;
    body.frequency.value = frequency * 2;
    bodyGain.gain.value = 0.16;
    filter.type = "lowpass";
    filter.frequency.value = Math.min(720, frequency * 4);
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume / 1.16, at + 0.018);
    gain.gain.exponentialRampToValueAtTime(volume * 0.66 / 1.16, at + duration * 0.34);
    gain.gain.setValueAtTime(volume * 0.66 / 1.16, at + duration * 0.76);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    sine.connect(filter);
    body.connect(bodyGain).connect(filter);
    filter.connect(gain).connect(this.musicGain);
    sine.start(at); body.start(at);
    sine.stop(at + duration + 0.03); body.stop(at + duration + 0.03);
    const untrack = this.trackMusicVoice(gain, [sine, body]);
    sine.onended = () => { untrack(); sine.disconnect(); body.disconnect(); bodyGain.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  private musicChord(at: number, root: number, chord: number[], duration: number, volume: number, instrument: MusicInstrument) {
    chord.forEach((semitone, index) => {
      this.musicPadVoice(at + index * 0.012, root * midiRatio(semitone), duration, volume * (index === 0 ? 1 : 0.86), (index - 1) * 0.42, instrument);
    });
  }

  private musicPadVoice(at: number, frequency: number, duration: number, volume: number, pan = 0, instrument: MusicInstrument = "strings") {
    const context = this.context;
    if (!context || !this.musicGain) return;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const profile = MUSIC_VOICES[instrument];
    const envelope = musicVoiceEnvelope(instrument, duration);
    if (this.musicWaves[instrument]) oscillator.setPeriodicWave(this.musicWaves[instrument]);
    else oscillator.type = "triangle";
    oscillator.frequency.value = frequency;
    filter.type = "lowpass";
    filter.frequency.value = Math.min(profile.cutoff, 1450);
    filter.Q.value = 0.5;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + envelope.attack);
    gain.gain.exponentialRampToValueAtTime(volume * envelope.sustain, at + envelope.decay);
    gain.gain.setValueAtTime(volume * envelope.sustain, at + envelope.release);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    const panner = context.createStereoPanner(); panner.pan.value = pan;
    oscillator.connect(filter).connect(gain).connect(panner).connect(this.musicGain);
    if (this.musicReverb) panner.connect(this.musicReverb);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.04);
    const untrack = this.trackMusicVoice(gain, [oscillator]);
    oscillator.onended = () => { untrack(); oscillator.disconnect(); filter.disconnect(); gain.disconnect(); panner.disconnect(); };
  }

  private musicKick(at: number, volume: number) {
    const context = this.context;
    if (!context || !this.musicGain) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(125, at);
    oscillator.frequency.exponentialRampToValueAtTime(43, at + 0.16);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
    oscillator.connect(gain).connect(this.musicGain);
    oscillator.start(at);
    oscillator.stop(at + 0.2);
    const untrack = this.trackMusicVoice(gain, [oscillator]);
    oscillator.onended = () => { untrack(); oscillator.disconnect(); gain.disconnect(); };
  }

  private musicSnare(at: number, volume: number) {
    const context = this.context;
    if (!context || !this.musicGain || !this.noiseBuffer) return;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.value = 1250;
    filter.Q.value = 0.55;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
    source.connect(filter).connect(gain).connect(this.musicGain);
    source.start(at);
    source.stop(at + 0.15);
    const untrack = this.trackMusicVoice(gain, [source]);
    source.onended = () => { untrack(); source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  private musicHat(at: number, volume: number, duration: number, cutoff = 2100) {
    const context = this.context;
    if (!context || !this.musicGain || !this.noiseBuffer) return;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.value = cutoff;
    filter.Q.value = 0.65;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(volume, at + Math.min(0.012, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(gain).connect(this.musicGain);
    source.start(at);
    source.stop(at + duration + 0.02);
    const untrack = this.trackMusicVoice(gain, [source]);
    source.onended = () => { untrack(); source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  private connectSfx(output: AudioNode, reverb = true) {
    if (this.effectsGain) output.connect(this.effectsGain);
    if (reverb && this.effectsReverbInput) output.connect(this.effectsReverbInput);
  }

  private duckMusic(at: number, amount: number) {
    const gain = this.musicDuck?.gain;
    if (!gain) return;
    gain.cancelScheduledValues(at);
    gain.setValueAtTime(gain.value, at);
    gain.linearRampToValueAtTime(amount, at + 0.025);
    gain.linearRampToValueAtTime(1, at + 0.48);
  }

  private chime(at: number, frequency: number, duration: number, volume: number) {
    [1, 2, 3].forEach((ratio, index) => this.tone(at, frequency * ratio, frequency * ratio,
      duration / (1 + index * 0.45), volume / (1 + index * 3), "sine"));
  }

  private musicTom(at: number, frequency: number, volume: number) {
    const context = this.context;
    if (!context || !this.musicGain) return;
    const source = context.createOscillator(), gain = context.createGain();
    source.frequency.setValueAtTime(frequency * 1.4, at);
    source.frequency.exponentialRampToValueAtTime(frequency, at + 0.1);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.009);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
    source.connect(gain).connect(this.musicGain);
    if (this.musicReverb) gain.connect(this.musicReverb);
    source.start(at); source.stop(at + 0.27);
    const untrack = this.trackMusicVoice(gain, [source]);
    source.onended = () => { untrack(); source.disconnect(); gain.disconnect(); };
  }

  private missileLaunch(at: number, volumeScale: number) {
    this.rumble(at, 0.54, 0.17 * volumeScale, 92, 43);
    this.sweepNoise(at, 0.78, 0.3 * volumeScale, 230, 4800, "bandpass");
    this.tone(at + 0.025, 78, 510, 0.65, 0.2 * volumeScale, "sawtooth");
  }

  private bouncyTone(at: number, duration: number, volume: number) {
    const context = this.context;
    if (!context) return;
    const oscillator = context.createOscillator();
    const partial = context.createOscillator();
    const partialGain = context.createGain();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    oscillator.type = "sine";
    partial.type = "triangle";
    oscillator.frequency.setValueAtTime(112, at);
    oscillator.frequency.exponentialRampToValueAtTime(245, at + duration * 0.24);
    oscillator.frequency.exponentialRampToValueAtTime(94, at + duration);
    partial.frequency.setValueAtTime(224, at);
    partial.frequency.exponentialRampToValueAtTime(470, at + duration * 0.24);
    partial.frequency.exponentialRampToValueAtTime(188, at + duration);
    partialGain.gain.value = 0.18;
    filter.type = "lowpass";
    filter.frequency.value = 1200;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(filter);
    partial.connect(partialGain).connect(filter);
    filter.connect(gain);
    this.connectSfx(gain, true);
    oscillator.start(at); partial.start(at);
    oscillator.stop(at + duration + 0.03); partial.stop(at + duration + 0.03);
    oscillator.onended = () => { oscillator.disconnect(); partial.disconnect(); partialGain.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  private tireChirp(at: number, duration: number, volume: number) {
    const context = this.context;
    if (!context) return;
    const primary = context.createOscillator();
    const harmonic = context.createOscillator();
    const harmonicGain = context.createGain();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    primary.type = "sawtooth";
    harmonic.type = "triangle";
    primary.frequency.setValueAtTime(118, at);
    primary.frequency.exponentialRampToValueAtTime(176, at + duration);
    harmonic.frequency.setValueAtTime(174, at);
    harmonic.frequency.exponentialRampToValueAtTime(264, at + duration);
    harmonicGain.gain.value = 0.24;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(780, at);
    filter.frequency.exponentialRampToValueAtTime(1320, at + duration);
    filter.Q.value = 3.1;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    primary.connect(filter);
    harmonic.connect(harmonicGain).connect(filter);
    filter.connect(gain);
    this.connectSfx(gain, false);
    primary.start(at); harmonic.start(at);
    primary.stop(at + duration + 0.03); harmonic.stop(at + duration + 0.03);
    primary.onended = () => {
      primary.disconnect(); harmonic.disconnect(); harmonicGain.disconnect(); filter.disconnect(); gain.disconnect();
    };
  }

  private metallic(at: number, frequency: number, duration: number, volume: number) {
    const context = this.context;
    if (!context) return;
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    const oscillators = [1, 1.47, 2.13].map((ratio, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index === 0 ? "triangle" : "sine";
      oscillator.frequency.value = Math.max(24, frequency * ratio);
      oscillator.detune.value = index * 7 - 5;
      oscillator.connect(filter);
      return oscillator;
    });
    filter.type = "bandpass";
    filter.frequency.value = Math.max(180, frequency * 1.35);
    filter.Q.value = 0.85;
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    filter.connect(gain);
    this.connectSfx(gain, true);
    oscillators.forEach((oscillator) => { oscillator.start(at); oscillator.stop(at + duration + 0.03); });
    oscillators[0].onended = () => { oscillators.forEach((oscillator) => oscillator.disconnect()); filter.disconnect(); gain.disconnect(); };
  }

  private rumble(at: number, duration: number, volume: number, from: number, to: number) {
    const context = this.context;
    if (!context || !this.noiseBuffer) return;
    const oscillator = context.createOscillator();
    const oscillatorGain = context.createGain();
    const noise = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(Math.max(24, from), at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(22, to), at + duration);
    oscillatorGain.gain.setValueAtTime(volume, at);
    oscillatorGain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    noise.buffer = this.noiseBuffer;
    noise.loop = duration > 0.65;
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = 320;
    noiseGain.gain.setValueAtTime(volume * 0.72, at);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(oscillatorGain);
    noise.connect(noiseFilter).connect(noiseGain);
    this.connectSfx(oscillatorGain, true);
    this.connectSfx(noiseGain, false);
    oscillator.start(at); noise.start(at);
    oscillator.stop(at + duration + 0.03); noise.stop(at + duration + 0.03);
    oscillator.onended = () => { oscillator.disconnect(); oscillatorGain.disconnect(); noise.disconnect(); noiseFilter.disconnect(); noiseGain.disconnect(); };
  }

  private sweepNoise(
    at: number,
    duration: number,
    volume: number,
    from: number,
    to: number,
    filterType: BiquadFilterType,
  ) {
    const context = this.context;
    if (!context || !this.noiseBuffer) return;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.noiseBuffer;
    source.loop = duration > 0.65;
    filter.type = filterType;
    filter.frequency.setValueAtTime(Math.max(30, from), at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, to), at + duration);
    filter.Q.value = filterType === "bandpass" ? 0.75 : 0.45;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + Math.min(0.045, duration * 0.18));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(gain);
    this.connectSfx(gain, true);
    source.start(at);
    source.stop(at + duration + 0.03);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  private tone(at: number, from: number, to: number, duration: number, volume: number, wave: OscillatorType) {
    const context = this.context;
    if (!context || !this.effectsGain) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(Math.max(20, from), at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + duration);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain);
    this.connectSfx(gain, true);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.025);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }

  private noise(at: number, duration: number, volume: number, frequency: number) {
    const context = this.context;
    if (!context || !this.effectsGain || !this.noiseBuffer) return;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = 0.72;
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(gain);
    this.connectSfx(gain, true);
    source.start(at);
    source.stop(at + duration + 0.025);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
}
