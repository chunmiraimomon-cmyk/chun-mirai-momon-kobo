import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");
const [page, tour, legacyPlayer, css, legacyCss, buttonSource, layout] = await Promise.all([
  read("app/page.tsx"), read("app/legacy-evolution-tour.tsx"), read("app/legacy-evolution-player.tsx"),
  read("app/race-hud.css"), read("app/legacy-race-hud.css"), read("app/race-pause-button.tsx"), read("index.html"),
]);
const buttonModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(buttonSource, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText, { exports: buttonModule.exports, require: () => jsxRuntime });

test("touch pause is a real accessible button, not part of the steering gesture surface", () => {
  let pauses = 0;
  let stopped = 0;
  const button = buttonModule.exports.RacePauseButton({ onPause: () => pauses++ });
  assert.equal(button.type, "button");
  assert.equal(button.props.type, "button");
  assert.equal(button.props["aria-haspopup"], "dialog");
  assert.match(button.props["aria-label"], /中断/);
  const event = { stopPropagation: () => stopped++ };
  button.props.onPointerDown(event);
  button.props.onPointerUp(event);
  button.props.onMouseDown(event);
  button.props.onMouseUp(event);
  assert.equal(pauses, 0, "opening on pointerdown could click through into the new dialog");
  button.props.onClick(event);
  assert.equal(pauses, 1);
  assert.equal(stopped, 5);
  assert.match(css, /\.race-pause-button\s*\{[^}]*z-index: 24/);
  assert.match(css, /\.race-pause-button\s*\{[^}]*min-height: 48px/);
});

test("current races and every archived build share the existing pause/return path", () => {
  assert.match(page, /phase === "racing" && !titleReturnConfirmOpen && !raceFaultReportOpen[\s\S]*?<RacePauseButton onPause=\{openTitleReturnConfirm\}/);
  assert.match(page, /<RaceWorld phase=\{phase\} paused=\{titleReturnConfirmOpen\}/);
  assert.match(tour, /!pauseOpen && <RacePauseButton onPause=\{requestPause\}/);
  assert.match(tour, /<LegacyEvolutionPlayer[^\n]+paused=\{pauseOpen\}/);
  assert.match(page, /onClick=\{returnToTitleFromRace\}[\s\S]*?>YES<small>メニューへ戻る/);
  assert.match(page, /onClick=\{closeTitleReturnConfirm\}[\s\S]*?>NO<small>レースを続ける/);
  assert.match(legacyPlayer, /!loadError && !paused &&/);
});

test("pausing with another finger releases held drift/skill and double-tap history", () => {
  const pauseEffect = page.match(/pausedRef\.current = paused;([\s\S]*?)\n  \}, \[paused\]\);/)[1];
  const activeTouchPointers = { current: new Map([[1, { drift: true, skillHold: true }]]) };
  const lastTouchTapAt = { current: { left: 10, right: 20 } };
  const touch = { current: { left: true, right: false, gas: true, drift: true, item: true, skill: true, driftOrigin: 1 } };
  const timers = [];
  new Function("paused", "activeTouchPointers", "lastTouchTapAt", "touch", "touchActionTimers", "window", pauseEffect)(
    true, activeTouchPointers, lastTouchTapAt, touch, { current: { item: 7, skill: 8 } }, { clearTimeout: (id) => timers.push(id) },
  );
  assert.equal(activeTouchPointers.current.size, 0);
  assert.deepEqual(lastTouchTapAt.current, { left: 0, right: 0 });
  assert.equal(touch.current.driftOrigin, 0);
  for (const key of ["left", "right", "gas", "brake", "drift", "item", "skill"]) assert.equal(touch.current[key], false);
  assert.deepEqual(timers, [7, 8]);
  assert.match(page, /phase === "racing" && !paused \? "active"/);
  assert.match(page, /if \(pausedRef\.current \|\| event.pointerType === "mouse"\) return/);
});

test("pause stops the race clock and physics; resume discards paused frame time", () => {
  assert.match(page, /if \(phase !== "racing" \|\| titleReturnConfirmOpen\) return/);
  assert.match(page, /elapsedAtResume \+ performance\.now\(\) - resumedAt/);
  assert.match(page, /if \(pausedRef\.current\) \{\s*previousFrameAt = frameNow;\s*physicsAccumulatorMs = 0;[\s\S]*?return;/);
});

test("simultaneous skill, quest, angle and combo messages flow in one measured stack", () => {
  assert.match(page, /className="race-status-stack"[\s\S]*?className="race-info-stack"[\s\S]*?className="race-action-stack"/);
  assert.match(page, /className="race-feedback-slot" ref=\{setFeedbackTarget\}/);
  assert.match(page, /skillFeedback && feedbackTarget && createPortal/);
  assert.match(css, /\.race-status-stack :is\([^}]+position: relative; inset: auto;[^}]+transform: none/);
  assert.match(css, /grid-template-columns: minmax\(0,1fr\) 64px/);
  assert.match(css, /\.skill-meter > div \{ grid-column: 1 \/ -1; grid-row: 2/);
  assert.match(css, /race-combo-pop 3s/);
  assert.match(css, /\.race-feedback-slot:empty \{ display: none/);
});

test("HUD responds to width AND available height, reserving safe areas and pause space", () => {
  for (const side of ["top", "right", "bottom", "left"]) assert.ok(css.includes(`env(safe-area-inset-${side}`));
  assert.match(css, /padding: var\(--race-top\) calc\(var\(--race-right\) \+ 92px\)/);
  assert.match(css, /@media \(max-width: 600px\) and \(orientation: portrait\)/);
  assert.match(css, /@media \(max-height: 540px\) and \(orientation: landscape\)/);
  assert.match(css, /grid-template-columns: minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(css, /\.mini-map-canvas \{ width: 100%; height: auto; aspect-ratio: 4 \/ 3/);
  assert.match(css, /\.drift-meter \{ bottom: calc\(var\(--race-bottom\) \+ 134px\)/);
  assert.match(css, /\.pause-confirm-overlay, \.legacy-tour-pause \{ overflow-y: auto/);
  assert.match(layout, /viewport-fit=cover/);
  assert.doesNotMatch(layout, /user-scalable=no|maximum-scale=1/);
});

test("pre-race menus do not show race-only minimap or controller HUD", () => {
  assert.match(page, /className={`controller-chip[^`]+`} hidden={phase !== "countdown" && phase !== "racing"}/);
  assert.match(page, /className="mini-map" hidden={phase !== "countdown" && phase !== "racing"}/);
  assert.match(css, /\.mini-map\[hidden\], \.controller-chip\[hidden\] \{ display: none !important/);
});

test("the minimap uses an inset right-side lane instead of the extreme bottom-left corner", () => {
  assert.match(css, /\.race-ui-active \.mini-map \{[\s\S]*?right: calc\(var\(--race-right\) \+ 14px\);[\s\S]*?left: auto;/);
  assert.match(css, /max-height: 540px[\s\S]*?\.race-ui-active \.mini-map \{ top: 50%;[\s\S]*?transform: translateY\(-50%\)/);
  assert.match(legacyCss, /\.legacy-root \.mini-map \{ top:[^}]+right:[^}]+left: auto;/);
});

test("menus with an inline BACK control do not receive a duplicate universal BACK", () => {
  assert.match(page, /const MENU_PHASES_WITH_INLINE_BACK:[\s\S]*?"character-select"[\s\S]*?"race-briefing"[\s\S]*?"course-create"/);
  assert.match(page, /MENU_PHASES_WITH_BACK\.has\(phase\) && !MENU_PHASES_WITH_INLINE_BACK\.has\(phase\)/);
  assert.match(page, /className="creator-exit-button"[^>]*>← TITLE/);
});

test("EVOLUTION TOUR controller focus can reach START, BUG ARCHIVE and BACK", () => {
  assert.match(tour, /type TourSelectFocus = "tours" \| "character" \| "start" \| "archive" \| "back"/);
  assert.match(tour, /const moveSelectFocus = useCallback/);
  assert.match(tour, /if \(current\.down && !previous\.down\) moveSelectFocus\(1\)/);
  assert.match(tour, /selectFocus === "archive"[\s\S]*?setScreen\("archive"\)/);
  assert.match(tour, /legacy-bug-archive-button \$\{selectFocus === "archive" \? "menu-focus"/);
});

test("archived shadow roots receive responsive HUD overrides without editing snapshots", () => {
  assert.match(legacyPlayer, /import legacyRaceHudCss from "\.\/legacy-race-hud\.css\?raw"/);
  assert.ok(legacyPlayer.includes("${legacyRaceHudCss}"));
  assert.match(legacyCss, /flex-wrap: wrap/);
  assert.match(legacyCss, /\+ 92px/);
  assert.match(legacyCss, /orientation: portrait/);
  assert.match(legacyCss, /orientation: landscape/);
});
