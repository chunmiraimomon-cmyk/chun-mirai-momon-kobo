import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  MUSIC_PATTERNS, GOJO_MUSIC_PATTERN, MUSIC_VOICES, midiFrequency,
  musicVoiceEnvelope, raceMusicStep, musicScheduleWindow,
} from "../lib/race-score.mjs";

const pieces = { ...MUSIC_PATTERNS, gojo: GOJO_MUSIC_PATTERN };
const chordTone = (note, chord) => chord.some((tone) => ((note - tone) % 12 + 12) % 12 === 0);

test("every course has a distinct sixteen-bar A/B phrase, rests, sustained notes and an exact loop", () => {
  const signatures = new Set();
  for (const [name, pattern] of Object.entries(pieces)) {
    assert.equal(pattern.bars.length, 16, name);
    assert.notDeepEqual(pattern.bars.slice(0, 8), pattern.bars.slice(8), name);
    signatures.add(JSON.stringify(pattern.bars.map((bar) => bar.notes)));
    let held = 0, rests = 0;
    for (const bar of pattern.bars) {
      assert.ok(bar.notes.length >= 1 && bar.notes.length <= 7, name);
      rests += pattern.stepsPerBar - bar.notes.reduce((sum, note) => sum + note.steps, 0);
      bar.notes.forEach((note, index) => {
        assert.ok(note.at >= 0 && note.at + note.steps <= pattern.stepsPerBar, name);
        if (index) assert.ok(bar.notes[index - 1].at + bar.notes[index - 1].steps <= note.at, name);
        if (note.steps >= 3) held++;
      });
    }
    assert.ok(held >= 1, name + " must contain held notes");
    assert.ok(rests >= 16, name + " needs breaths");
    const loop = pattern.stepsPerBar * pattern.bars.length;
    for (let step = 0; step < loop; step++) {
      assert.deepEqual(raceMusicStep(step, pattern, 1), raceMusicStep(step + loop, pattern, 1));
    }
  }
  assert.equal(signatures.size, 8);
});

test("sustained melody tones match harmony; passing notes remain brief and diatonic", () => {
  for (const [name, pattern] of Object.entries(pieces)) {
    for (let step = 0; step < pattern.stepsPerBar * 16; step++) {
      const score = raceMusicStep(step, pattern, 1);
      for (const note of [score.lead, score.bass, score.arp, ...score.voicing]) {
        if (note !== null) assert.ok(pattern.scale.includes((note % 12 + 12) % 12), name + " key");
      }
      for (const note of [score.bass, score.arp, ...score.voicing]) {
        if (note !== null) assert.ok(chordTone(note, score.chord), name + " accompaniment");
      }
      if (score.lead !== null && !chordTone(score.lead, score.chord)) {
        assert.equal(score.leadSteps, 1, name + " dissonance must not be held");
      }
    }
    assert.equal(pattern.bars.at(-1).notes[0].note % 12, 0, name + " final tonic");
  }
});

test("bass is audible, melody stays in a warm register and pad inversions avoid large jumps", () => {
  for (const [name, pattern] of Object.entries(pieces)) {
    assert.ok(Math.abs(pattern.root - midiFrequency(pattern.tonicMidi)) < 1e-9);
    for (let step = 0; step < pattern.stepsPerBar * 16; step++) {
      const score = raceMusicStep(step, pattern, 1);
      const hz = (note) => pattern.root * 2 ** (note / 12);
      if (score.lead !== null) assert.ok(hz(score.lead) >= 160 && hz(score.lead) <= 523.26, name + " lead ceiling C5");
      if (score.bass !== null) assert.ok(hz(score.bass) >= 70 && hz(score.bass) <= 210, name + " bass");
      score.voicing.forEach((note) => assert.ok(hz(note) >= 140 && hz(note) <= 440, name + " pad"));
    }
    pattern.bars.forEach((bar, index) => {
      const next = pattern.bars[(index + 1) % 16];
      bar.voicing.forEach((note, voice) => assert.ok(Math.abs(note - next.voicing[voice]) <= 5, name + " voice leading"));
    });
    const melody = pattern.bars.flatMap(bar => bar.notes.map(note => note.note));
    melody.forEach((note, index) => assert.ok(Math.abs(note - melody[(index + 1) % melody.length]) <= 7, name + " sudden melodic leap"));
  }
});

test("boost never introduces sudden high notes or cymbals; Gojo tension stays fixed", () => {
  for (const pattern of Object.values(pieces)) {
    for (let step = 0; step < pattern.stepsPerBar * 16; step++) {
      const relaxed = raceMusicStep(step, pattern, 0);
      const boost = raceMusicStep(step, pattern, 1);
      assert.deepEqual(relaxed, boost);
      assert.equal(boost.arp, null);
      assert.equal(boost.cymbal, false);
    }
  }
  for (let step = 0; step < 128; step++) {
    assert.deepEqual(raceMusicStep(step, GOJO_MUSIC_PATTERN, 0), raceMusicStep(step, GOJO_MUSIC_PATTERN, 1));
  }
});

test("seven stages have different orchestration, harmony and rhythm instead of one shared backing", () => {
  const stages = Object.entries(pieces).filter(([name]) => name !== "custom");
  assert.equal(new Set(stages.map(([,p]) => p.instrument)).size, 7);
  assert.equal(new Set(stages.map(([,p]) => JSON.stringify(p.bars.map(b => b.chord)))).size, 7);
  const rhythms = stages.map(([,p]) => JSON.stringify(Array.from({length:p.stepsPerBar * 16}, (_,step) => {
    const s = raceMusicStep(step,p);
    return [s.bass !== null,s.chordOn,s.kick,s.snare,s.hat,s.shaker,s.toms.length];
  })));
  assert.equal(new Set(rhythms).size, 7);
  assert.equal(MUSIC_PATTERNS.jungle.stepsPerBar, 12);
  assert.equal(MUSIC_PATTERNS.pirate.stepsPerBar, 6);
  assert.equal(MUSIC_PATTERNS.cloud.stepsPerBar, 6);
  assert.ok(MUSIC_PATTERNS.city.bpm - MUSIC_PATTERNS.cloud.bpm >= 60);
  for (let step=0;step<96;step++) {
    const s=raceMusicStep(step,MUSIC_PATTERNS.cloud);
    assert.ok(!s.kick && !s.snare && !s.hat && !s.shaker && s.toms.length===0);
  }
});

test("held notes have attack, decay, sustain and release, with restrained harmonic spectra", () => {
  for (const [name, profile] of Object.entries(MUSIC_VOICES)) {
    assert.ok(profile.cutoff <= 1900);
    assert.equal(profile.octave, false);
    assert.ok(profile.partials.length <= 6);
    assert.equal(profile.partials[0], 0);
    assert.ok(profile.colour <= 0.17);
    for (const duration of [0.12, 0.25, 0.7, 1.4]) {
      const envelope = musicVoiceEnvelope(name, duration);
      assert.ok(envelope.attack > 0 && envelope.attack < envelope.decay);
      assert.ok(envelope.decay <= envelope.release && envelope.release < duration);
      assert.ok(envelope.sustain >= 0.3 && envelope.sustain <= 0.82);
      if (duration >= 0.7) assert.ok(envelope.release - envelope.decay >= duration * 0.3);
    }
  }
});

test("late, invalid and background-tab clocks never request a past-note backlog", () => {
  for (const stepDuration of [0.001, 0.2, 0.3, NaN, Infinity]) {
    const recovered = musicScheduleWindow(2, 3602, stepDuration);
    assert.equal(recovered.start, 3602.025);
    assert.ok(recovered.maxSteps >= 1 && recovered.maxSteps <= 8);
  }
  assert.equal(musicScheduleWindow(10.1, 10, 0.2).start, 10.1);
  assert.equal(musicScheduleWindow(9.99, 10, 0.2).start, 10.025);
  assert.ok(Number.isFinite(musicScheduleWindow(NaN, 20, 0.2).start));
});

// Exercise the actual controller without a sound device. This validates WebAudio
// scheduling/envelopes and transport gates, not the subjective listening result.
const compiled = ts.transpileModule(readFileSync(new URL("../app/game-audio.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText.replace("../lib/race-score.mjs", new URL("../lib/race-score.mjs", import.meta.url).href);
const { GameAudioController } = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));

class RecordedParam {
  value = 0;
  calls = [];
  setValueAtTime(value, at) { this.calls.push(["set", value, at]); }
  exponentialRampToValueAtTime(value, at) { assert.ok(value > 0); this.calls.push(["exp", value, at]); }
  linearRampToValueAtTime(value, at) { this.calls.push(["linear", value, at]); }
  setTargetAtTime(value, at) { this.calls.push(["target", value, at]); }
  cancelScheduledValues() {}
  cancelAndHoldAtTime(at) { this.calls.push(["hold", this.value, at]); }
}
class RecordedNode {
  gain = new RecordedParam();
  frequency = new RecordedParam();
  detune = new RecordedParam();
  Q = new RecordedParam();
  pan = new RecordedParam();
  starts = [];
  stops = [];
  constructor(context) { this.context = context; }
  connect() { return this; }
  disconnect() {}
  setPeriodicWave() {}
  start(at) { assert.ok(at >= this.context.currentTime); this.starts.push(at); }
  stop(at) { assert.ok(at >= this.context.currentTime); this.stops.push(at); }
}
class RecordedContext {
  state = "running";
  nodes = [];
  constructor(now) { this.currentTime = now; }
  node() { const node = new RecordedNode(this); this.nodes.push(node); return node; }
  createGain() { return this.node(); }
  createOscillator() { return this.node(); }
  createBiquadFilter() { return this.node(); }
  createStereoPanner() { return this.node(); }
  createBufferSource() { return this.node(); }
}
const controllerAt = (now = 10) => {
  const controller = new GameAudioController();
  controller.context = new RecordedContext(now);
  controller.musicGain = controller.context.createGain();
  controller.noiseBuffer = {};
  controller.musicActive = true;
  return controller;
};

test("controller schedules authored note lengths and normalises layered timbre peaks", () => {
  for (const instrument of Object.keys(MUSIC_VOICES)) {
    const controller = controllerAt();
    controller.musicInstrumentTone(10.1, 440, 1.1, 0.084, instrument);
    const sources = controller.context.nodes.filter((node) => node.starts.length);
    assert.equal(sources.length, 2);
    sources.forEach((source) => {
      assert.equal(source.starts[0], 10.1);
      assert.ok(Math.abs(source.stops[0] - 11.225) < 1e-9);
      assert.equal(source.frequency.value, 440, "no extra high octave");
    });
    const envelope = controller.context.nodes.find((node) => node.gain.calls.length === 5).gain.calls;
    assert.ok(envelope[1][1] * (1 + MUSIC_VOICES[instrument].colour) <= 0.084000001);
    for (let index = 1; index < envelope.length; index++) assert.ok(envelope[index][2] >= envelope[index - 1][2]);
  }
});

test("actual scheduler is bounded after a long stall and honours music lifecycle gates", () => {
  const controller = controllerAt(3602);
  controller.nextMusicAt = 2;
  controller.musicStep = 128;
  controller.courseId = "river";
  controller.scheduleMusic();
  assert.equal(controller.musicStep, 1, "long stall restarts a complete phrase");
  const sources = controller.context.nodes.filter((node) => node.starts.length);
  assert.ok(sources.length > 0 && sources.length < 20);
  sources.forEach((source) => assert.ok(source.starts[0] >= 3602.025 && source.starts[0] < 3602.2));
  for (const gate of ["muted", "inactive", "silent", "suspended"]) {
    const gated = controllerAt();
    if (gate === "muted") gated.muted = true;
    if (gate === "inactive") gated.musicActive = false;
    if (gate === "silent") gated.bgmVolume = 0;
    if (gate === "suspended") gated.context.state = "suspended";
    gated.nextMusicAt = 0;
    gated.scheduleMusic();
    assert.equal(gated.musicStep, 0, gate);
    assert.equal(gated.context.nodes.filter((node) => node.starts.length).length, 0, gate);
  }
});

test("scheduler triggers a long melody once instead of repeating its eighth-note ticks", () => {
  const controller = controllerAt(10);
  controller.courseId = "cloud";
  controller.nextMusicAt = 10.025;
  const lead = [];
  controller.musicInstrumentTone = (...args) => lead.push(args);
  controller.scheduleMusic();
  assert.equal(lead.length, 1);
  assert.ok(lead[0][2] > 0.9);
  controller.context.currentTime = controller.nextMusicAt - 0.1;
  controller.scheduleMusic();
  assert.equal(lead.length, 1);
});

test("countdown-to-race keeps the phrase; course/Gojo changes select their own score", () => {
  const controller = controllerAt();
  const lead = [];
  controller.musicInstrumentTone = (...args) => lead.push(args);
  controller.musicActive = false;
  controller.setScene("countdown", "river");
  assert.equal(controller.musicStep, 1);
  const river = MUSIC_PATTERNS.river;
  assert.ok(Math.abs(lead[0][1] - river.root * 2 ** (river.bars[0].notes[0].note / 12)) < 1e-9);
  controller.setScene("racing", "river");
  assert.equal(controller.musicStep, 1);
  assert.equal(lead.length, 1);
  controller.setScene("racing", "river", true);
  assert.equal(controller.musicStep, 1);
  assert.equal(lead.length, 2);
  const gojo = GOJO_MUSIC_PATTERN;
  assert.ok(Math.abs(lead[1][1] - gojo.root * 2 ** (gojo.bars[0].notes[0].note / 12)) < 1e-9);
  controller.setScene("finished", "river", true);
  assert.equal(controller.musicActive, false);
  assert.equal(lead.length, 2);
  controller.musicStep = 42;
  controller.setScene("countdown", "river", true);
  assert.equal(controller.musicStep, 1, "same-course restart starts a fresh phrase");
});

test("score changes softly stop old and future voices instead of overlapping different keys", () => {
  const controller=controllerAt();
  controller.musicInstrumentTone(10.025,330,2,.084,"brass");
  controller.musicInstrumentTone(10.15,440,2,.084,"brass");
  const oldSources=controller.context.nodes.filter(n=>n.starts.length);
  assert.equal(controller.musicVoices.size,2);
  controller.setScene("racing","river");
  oldSources.forEach(source=>assert.equal(source.stops.at(-1),10.06));
  const fading=controller.context.nodes.filter(n=>n.gain.calls.some(c=>c[0]==="hold"));
  assert.equal(fading.length,2);
  fading.forEach(n=>assert.equal(n.gain.calls.at(-1)[0],"target"));
});

test("BGM percussion uses a short soft attack instead of instant full-volume noise", () => {
  for(const method of ["musicKick","musicSnare","musicHat","musicTom"]) {
    const controller=controllerAt();
    if(method==="musicTom") controller[method](10.1,124,.064);
    else controller[method](10.1,.06,.075);
    const envelopes=controller.context.nodes.filter(n=>n.gain.calls.length>=2);
    assert.ok(envelopes.length>0,method);
    for(const node of envelopes) {
      assert.equal(node.gain.calls[0][1],.0001,method);
      assert.equal(node.gain.calls[1][0],"linear",method);
      assert.ok(node.gain.calls[1][2]>=10.108-1e-9,method);
    }
  }
});

test("unmuting a held-pad score restarts its harmony instead of leaving missing accompaniment", () => {
  const controller=controllerAt();
  controller.courseId="cloud";
  controller.musicStep=1;
  controller.muted=true;
  controller.scheduleMusic();
  controller.context.currentTime=20;
  controller.scheduleMusic();
  controller.muted=false;
  const chords=[];
  controller.musicChord=(...args)=>chords.push(args);
  controller.scheduleMusic();
  assert.equal(controller.musicStep,1);
  assert.equal(chords.length,1);
  assert.deepEqual(chords[0][2],MUSIC_PATTERNS.cloud.bars[0].voicing);
});
