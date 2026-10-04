"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const W = 960;
const H = 600;
const CX = 480;
const CY = 312;
const START_ANGLE = Math.PI / 2;
const TAU = Math.PI * 2;

type GamePhase = "ready" | "countdown" | "racing" | "finished";

type Car = {
  x: number;
  y: number;
  angle: number;
  speed: number;
  progress: number;
  lastTheta: number;
};

type Rival = {
  name: string;
  color: string;
  accent: string;
  progress: number;
  speed: number;
  lane: number;
};

const RIVALS: Rival[] = [
  { name: "PIXEL", color: "#ff4fa3", accent: "#ffe1f0", progress: -0.09, speed: 0.000075, lane: -15 },
  { name: "VOLT", color: "#8a63ff", accent: "#e5ddff", progress: -0.18, speed: 0.000071, lane: 12 },
  { name: "COMET", color: "#ffb545", accent: "#fff0ca", progress: -0.27, speed: 0.000068, lane: -3 },
];

const RIVAL_BADGES: Record<string, string> = {
  PIXEL: "PX",
  VOLT: "VT",
  COMET: "CM",
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function wrapAngle(value: number) {
  while (value > Math.PI) value -= TAU;
  while (value < -Math.PI) value += TAU;
  return value;
}

function initialCar(): Car {
  return {
    x: CX,
    y: CY + 168,
    angle: Math.PI,
    speed: 0,
    progress: 0,
    lastTheta: START_ANGLE,
  };
}

function formatTime(ms: number) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centis = Math.floor((ms % 1000) / 10);
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${centis
    .toString()
    .padStart(2, "0")}`;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function drawKart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  color: string,
  accent: string,
  player = false,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  if (player) {
    ctx.shadowColor = "#8effff";
    ctx.shadowBlur = 18;
  }

  ctx.fillStyle = "#090d1a";
  ctx.fillRect(-13, -20, 7, 12);
  ctx.fillRect(-13, 9, 7, 12);
  ctx.fillRect(7, -20, 7, 12);
  ctx.fillRect(7, 9, 7, 12);

  ctx.fillStyle = color;
  drawRoundedRect(ctx, -11, -20, 22, 40, 8);
  ctx.fill();
  ctx.fillStyle = accent;
  drawRoundedRect(ctx, -7, -13, 14, 18, 6);
  ctx.fill();
  ctx.fillStyle = "#18223d";
  ctx.beginPath();
  ctx.arc(0, -5, 6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = player ? "#a9ffff" : accent;
  ctx.fillRect(-8, 12, 16, 4);

  ctx.restore();
}

function GameCanvas({
  phase,
  countdown,
  runId,
  onTelemetry,
  onFinish,
}: {
  phase: GamePhase;
  countdown: string;
  runId: number;
  onTelemetry: (speed: number, progress: number, position: number) => void;
  onFinish: (time: number, position: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keys = useRef<Record<string, boolean>>({});
  const car = useRef<Car>(initialCar());
  const rivals = useRef<Rival[]>(RIVALS.map((rival) => ({ ...rival })));
  const particles = useRef<{ x: number; y: number; life: number }[]>([]);
  const raceStart = useRef(0);
  const finished = useRef(false);
  const touch = useRef({ left: false, right: false, gas: false, brake: false });

  useEffect(() => {
    car.current = initialCar();
    rivals.current = RIVALS.map((rival) => ({ ...rival }));
    particles.current = [];
    finished.current = false;
  }, [runId]);

  useEffect(() => {
    if (phase === "racing") raceStart.current = performance.now();
  }, [phase]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
        event.preventDefault();
      }
      keys.current[event.key.toLowerCase()] = true;
    };
    const up = (event: KeyboardEvent) => {
      keys.current[event.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let previous = performance.now();
    let hudTick = 0;

    const render = (now: number) => {
      const dt = Math.min(32, now - previous);
      previous = now;
      const racer = car.current;

      if (phase === "racing" && !finished.current) {
        const accelerate = keys.current.arrowup || keys.current.w || touch.current.gas;
        const brake = keys.current.arrowdown || keys.current.s || touch.current.brake;
        const left = keys.current.arrowleft || keys.current.a || touch.current.left;
        const right = keys.current.arrowright || keys.current.d || touch.current.right;

        if (accelerate) racer.speed += 0.014 * dt;
        if (brake) racer.speed -= 0.019 * dt;

        const outer = ((racer.x - CX) / 390) ** 2 + ((racer.y - CY) / 252) ** 2;
        const inner = ((racer.x - CX) / 225) ** 2 + ((racer.y - CY) / 108) ** 2;
        const onRoad = outer < 1 && inner > 1;

        const turn = (left ? -1 : 0) + (right ? 1 : 0);
        if (Math.abs(racer.speed) > 0.1) {
          racer.angle += turn * 0.0032 * dt * (racer.speed >= 0 ? 1 : -1);
        }

        racer.speed *= Math.pow(onRoad ? 0.992 : 0.965, dt / 16.67);
        racer.speed = clamp(racer.speed, -2.3, onRoad ? 7.2 : 3.2);

        const boostTheta = [0.08, 2.95, 5.15];
        const theta = Math.atan2((racer.y - CY) / 170, (racer.x - CX) / 305);
        const onBoost = boostTheta.some((zone) => Math.abs(wrapAngle(theta - zone)) < 0.095) && onRoad;
        if (onBoost && racer.speed > 1.5) {
          racer.speed = clamp(racer.speed + 0.045 * dt, -2.3, 9.4);
          if (Math.random() > 0.5) {
            particles.current.push({
              x: racer.x - Math.cos(racer.angle) * 20 + (Math.random() - 0.5) * 10,
              y: racer.y - Math.sin(racer.angle) * 20 + (Math.random() - 0.5) * 10,
              life: 1,
            });
          }
        }

        racer.x += Math.cos(racer.angle) * racer.speed * (dt / 16.67);
        racer.y += Math.sin(racer.angle) * racer.speed * (dt / 16.67);
        racer.x = clamp(racer.x, 22, W - 22);
        racer.y = clamp(racer.y, 22, H - 22);

        const currentTheta = Math.atan2((racer.y - CY) / 168, (racer.x - CX) / 305);
        let delta = currentTheta - racer.lastTheta;
        if (delta > Math.PI) delta -= TAU;
        if (delta < -Math.PI) delta += TAU;
        if (onRoad && Math.abs(delta) < 0.12) racer.progress += delta / TAU;
        racer.progress = Math.max(-0.04, racer.progress);
        racer.lastTheta = currentTheta;

        rivals.current.forEach((rival, index) => {
          rival.progress += rival.speed * dt * (1 + Math.sin(now / 900 + index) * 0.035);
          const t = START_ANGLE + rival.progress * TAU;
          const rx = 307 + rival.lane;
          const ry = 169 + rival.lane * 0.45;
          const x = CX + Math.cos(t) * rx;
          const y = CY + Math.sin(t) * ry;
          if (Math.hypot(x - racer.x, y - racer.y) < 30) {
            racer.speed *= 0.82;
            racer.x -= Math.cos(racer.angle) * 4;
            racer.y -= Math.sin(racer.angle) * 4;
          }
        });

        const position = 1 + rivals.current.filter((rival) => rival.progress > racer.progress).length;
        if (now - hudTick > 80) {
          hudTick = now;
          onTelemetry(Math.max(0, racer.speed * 31), racer.progress, position);
        }

        if (racer.progress >= 0.995) {
          finished.current = true;
          racer.speed *= 0.5;
          onFinish(now - raceStart.current, position);
        }
      }

      ctx.clearRect(0, 0, W, H);
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#090b20");
      sky.addColorStop(1, "#101936");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Night-sky speckles and city glow.
      for (let i = 0; i < 90; i++) {
        const x = (i * 137.5) % W;
        const y = (i * 61.3) % H;
        ctx.fillStyle = i % 4 === 0 ? "rgba(86,238,255,.22)" : "rgba(255,255,255,.10)";
        ctx.fillRect(x, y, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
      }

      ctx.save();
      ctx.shadowColor = "rgba(69, 222, 255, .45)";
      ctx.shadowBlur = 28;
      ctx.fillStyle = "#25314b";
      ctx.beginPath();
      ctx.ellipse(CX, CY, 396, 258, 0, 0, TAU);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = "#171d32";
      ctx.beginPath();
      ctx.ellipse(CX, CY, 376, 238, 0, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,.18)";
      ctx.lineWidth = 2;
      ctx.setLineDash([22, 24]);
      ctx.beginPath();
      ctx.ellipse(CX, CY, 306, 169, 0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#0d1630";
      ctx.beginPath();
      ctx.ellipse(CX, CY, 220, 103, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "#9a60ff";
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Inner-island city.
      const buildings = [
        [360, 282, 38, 52], [405, 260, 46, 75], [457, 276, 34, 58],
        [499, 250, 45, 83], [550, 270, 35, 63],
      ];
      buildings.forEach(([x, y, w, h], index) => {
        ctx.fillStyle = index % 2 ? "#1a2750" : "#172342";
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = index % 2 ? "#50edff" : "#ff55ad";
        for (let wy = y + 9; wy < y + h - 4; wy += 13) {
          for (let wx = x + 7; wx < x + w - 4; wx += 12) ctx.fillRect(wx, wy, 3, 5);
        }
      });
      ctx.fillStyle = "rgba(93, 243, 255, .8)";
      ctx.font = "700 13px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("NOVA CITY", CX, CY + 76);

      // Outer neon rail.
      ctx.strokeStyle = "#43eaff";
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(CX, CY, 397, 259, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Boost strips.
      [0.08, 2.95, 5.15].forEach((t) => {
        const x = CX + Math.cos(t) * 306;
        const y = CY + Math.sin(t) * 169;
        const tangent = Math.atan2(169 * Math.cos(t), -306 * Math.sin(t));
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(tangent);
        ctx.fillStyle = "rgba(67, 234, 255, .23)";
        ctx.fillRect(-22, -45, 44, 90);
        ctx.fillStyle = "#65f6ff";
        for (let yy = -33; yy <= 25; yy += 16) {
          ctx.beginPath();
          ctx.moveTo(-9, yy);
          ctx.lineTo(0, yy + 9);
          ctx.lineTo(9, yy);
          ctx.lineTo(9, yy + 7);
          ctx.lineTo(0, yy + 16);
          ctx.lineTo(-9, yy + 7);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      });

      // Start/finish checker line.
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 2; col++) {
          ctx.fillStyle = (row + col) % 2 ? "#11162a" : "#f8fbff";
          ctx.fillRect(CX - 54 + row * 13.5, CY + 112 + col * 56, 14, 56);
        }
      }

      // Trackside lights.
      for (let i = 0; i < 28; i++) {
        const t = (i / 28) * TAU;
        const x = CX + Math.cos(t) * 410;
        const y = CY + Math.sin(t) * 269;
        ctx.fillStyle = i % 2 ? "#ff4fa3" : "#4af1ff";
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, TAU);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      rivals.current.forEach((rival) => {
        const t = START_ANGLE + rival.progress * TAU;
        const rx = 307 + rival.lane;
        const ry = 169 + rival.lane * 0.45;
        const x = CX + Math.cos(t) * rx;
        const y = CY + Math.sin(t) * ry;
        const heading = Math.atan2(ry * Math.cos(t), -rx * Math.sin(t));
        drawKart(ctx, x, y, heading, rival.color, rival.accent);
      });

      particles.current = particles.current.filter((particle) => particle.life > 0.02);
      particles.current.forEach((particle) => {
        particle.life -= 0.045;
        ctx.globalAlpha = particle.life;
        ctx.fillStyle = "#68f9ff";
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, 3 + (1 - particle.life) * 5, 0, TAU);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      drawKart(ctx, racer.x, racer.y, racer.angle, "#25d9db", "#d6ffff", true);

      if (phase === "countdown") {
        ctx.fillStyle = "rgba(3,5,16,.24)";
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = "center";
        ctx.font = "900 136px Impact, Arial Black, sans-serif";
        ctx.fillStyle = countdown === "GO!" ? "#64f6d2" : "#ffffff";
        ctx.shadowColor = countdown === "GO!" ? "#44ffd1" : "#ff4fa3";
        ctx.shadowBlur = 35;
        ctx.fillText(countdown, W / 2, H / 2 + 44);
        ctx.shadowBlur = 0;
      }

      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [phase, countdown, runId, onFinish, onTelemetry]);

  const bindTouch = (key: keyof typeof touch.current) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      touch.current[key] = true;
    },
    onPointerUp: () => (touch.current[key] = false),
    onPointerCancel: () => (touch.current[key] = false),
    onPointerLeave: () => (touch.current[key] = false),
  });

  return (
    <div className="canvas-shell">
      <canvas ref={canvasRef} width={W} height={H} aria-label="ネオンシティのカートレースコース" />
      <div className="touch-controls" aria-label="タッチ操作">
        <div className="touch-cluster">
          <button {...bindTouch("left")} aria-label="左へ曲がる">←</button>
          <button {...bindTouch("right")} aria-label="右へ曲がる">→</button>
        </div>
        <div className="touch-cluster">
          <button className="brake" {...bindTouch("brake")} aria-label="ブレーキ">BRAKE</button>
          <button className="gas" {...bindTouch("gas")} aria-label="アクセル">GO</button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [phase, setPhase] = useState<GamePhase>("ready");
  const [countdown, setCountdown] = useState("3");
  const [runId, setRunId] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [position, setPosition] = useState(4);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [finishTime, setFinishTime] = useState(0);
  const [finishPosition, setFinishPosition] = useState(1);
  const timerStart = useRef(0);

  useEffect(() => {
    if (phase !== "racing") return;
    timerStart.current = performance.now();
    const id = window.setInterval(() => setElapsed(performance.now() - timerStart.current), 31);
    return () => window.clearInterval(id);
  }, [phase]);

  const startRace = useCallback(() => {
    setRunId((value) => value + 1);
    setSpeed(0);
    setPosition(4);
    setProgress(0);
    setElapsed(0);
    setCountdown("3");
    setPhase("countdown");
    const sequence = ["2", "1", "GO!"];
    sequence.forEach((value, index) => {
      window.setTimeout(() => setCountdown(value), (index + 1) * 700);
    });
    window.setTimeout(() => setPhase("racing"), 2800);
  }, []);

  const handleTelemetry = useCallback((nextSpeed: number, nextProgress: number, nextPosition: number) => {
    setSpeed(Math.round(nextSpeed));
    setProgress(clamp(nextProgress, 0, 1));
    setPosition(nextPosition);
  }, []);

  const handleFinish = useCallback((time: number, nextPosition: number) => {
    setFinishTime(time);
    setFinishPosition(nextPosition);
    setElapsed(time);
    setSpeed(0);
    setPhase("finished");
  }, []);

  const leaderboard = RIVALS.map((rival) => ({
      name: rival.name,
      badge: RIVAL_BADGES[rival.name],
      color: rival.name.toLowerCase(),
    }));
  leaderboard.splice(position - 1, 0, { name: "YOU", badge: "ME", color: "cyan" });

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Neon Circuit ホーム">
          <span className="brand-mark">NC</span>
          <span><b>NEON</b> CIRCUIT</span>
        </a>
        <div className="status-pill"><i /> ARCADE ONLINE</div>
        <div className="sound-pill" aria-label="サウンド情報">VOL <span>▮▮▮</span></div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span>01</span> NIGHT SHIFT CUP</div>
          <h1>OWN THE<br /><em>AFTERGLOW.</em></h1>
          <p>闇を裂く、1ラップのネオンバトル。<br />ラインを攻めて、ブーストを踏み抜け。</p>
        </div>
        <div className="hero-stat">
          <span>TRACK</span><b>NOVA LOOP</b>
          <small>1 LAP · 4 RACERS</small>
        </div>
      </section>

      <section className="game-layout" aria-label="ゲームエリア">
        <div className="game-stage">
          <div className="game-hud">
            <div className="position"><b>{position}</b><span>/4<br />POSITION</span></div>
            <div className="lap"><span>LAP</span><b>1/1</b></div>
            <div className="timer"><span>RACE TIME</span><b>{formatTime(elapsed)}</b></div>
            <div className="speed"><b>{speed}</b><span>KM/H</span></div>
          </div>

          <GameCanvas
            phase={phase}
            countdown={countdown}
            runId={runId}
            onTelemetry={handleTelemetry}
            onFinish={handleFinish}
          />

          {phase === "ready" && (
            <div className="game-overlay">
              <div className="overlay-kicker">NOVA LOOP // GRID 04</div>
              <h2>READY TO<br /><span>BREAK AWAY?</span></h2>
              <p><kbd>WASD</kbd> または <kbd>矢印キー</kbd> でドライブ</p>
              <button className="race-button" onClick={startRace}>START RACE <span>→</span></button>
            </div>
          )}

          {phase === "finished" && (
            <div className="game-overlay finish-overlay">
              <div className="overlay-kicker">RACE COMPLETE</div>
              <h2>{finishPosition === 1 ? "YOU OWNED" : "CHASE THE"}<br /><span>{finishPosition === 1 ? "THE NIGHT." : "PODIUM."}</span></h2>
              <div className="finish-result"><b>{finishPosition}<sup>{finishPosition === 1 ? "ST" : finishPosition === 2 ? "ND" : finishPosition === 3 ? "RD" : "TH"}</sup></b><span>{formatTime(finishTime)}</span></div>
              <button className="race-button" onClick={startRace}>RACE AGAIN <span>↻</span></button>
            </div>
          )}
        </div>

        <aside className="race-panel">
          <div className="panel-heading">
            <span>LIVE GRID</span>
            <b>{Math.round(progress * 100)}%</b>
          </div>
          <div className="progress-track"><i style={{ width: `${progress * 100}%` }} /></div>

          <div className="leaderboard">
            {leaderboard.map((racer, index) => (
              <div className={`racer-row ${racer.name === "YOU" ? "active" : ""}`} key={racer.name}>
                <b className="rank">0{index + 1}</b>
                <span className={`avatar ${racer.color}`}>{racer.badge}</span>
                <span className="racer-name">{racer.name}<small>{racer.name === "YOU" ? "PLAYER ONE" : "NOVA CREW"}</small></span>
                <span className="racer-dot" />
              </div>
            ))}
          </div>

          <div className="control-card">
            <span>DRIVE CONTROLS</span>
            <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div>
            <p>アクセル・ブレーキ・ステアリング</p>
          </div>
          <div className="boost-tip"><i>⚡</i><span><b>CYAN BOOST</b>水色のパッドで最高速へ</span></div>
        </aside>
      </section>

      <footer>
        <span>NEON CIRCUIT © 2088</span>
        <span>ORIGINAL BROWSER ARCADE</span>
        <span>RACE CLEAN. RACE BRIGHT.</span>
      </footer>
    </main>
  );
}
