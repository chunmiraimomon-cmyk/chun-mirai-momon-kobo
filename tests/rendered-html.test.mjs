import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the current full-height game shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>MOMON GRAND PRIX: PRISM SHIFT<\/title>/);
  assert.match(html, /<main class="expanded-game-page">/);
  assert.match(html, /class="game-layout fullscreen-game-layout/);
  assert.doesNotMatch(html, /class="status-pill"/);
  assert.doesNotMatch(html, /class="race-intro"/);
  assert.doesNotMatch(html, /class="control-card"/);
  assert.doesNotMatch(html, /class="topbar"/);
  assert.doesNotMatch(html, /class="race-panel"/);
  assert.doesNotMatch(html, /<footer>/);
});

test("the renamed game title is consistent across the title screen and social metadata", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /aria-label="MOMON GRAND PRIX: PRISM SHIFT"/);
  assert.match(page, />MOMON<br \/><span>GRAND PRIX<\/span><\/h2>/);
  assert.match(page, />PRISM SHIFT<\/div>/);
  assert.equal((layout.match(/MOMON GRAND PRIX: PRISM SHIFT/g) ?? []).length, 4);
  assert.match(layout, /images: \["\/og\.png"\]/);
});

test("the race surface fills the complete viewport without site chrome", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /className=\{phase === "course-create" \? "creator-page" : "expanded-game-page"\}/);
  assert.match(page, /phase === "course-create" \? "creator-layout" : "fullscreen-game-layout"/);
  assert.match(css, /\.expanded-game-page\s*\{[^}]*height:\s*100dvh/);
  assert.match(css, /\.fullscreen-game-layout\s*\{[^}]*width:\s*100vw;[^}]*height:\s*100dvh/);
  assert.match(css, /\.fullscreen-game-layout \.game-stage\s*\{[^}]*height:\s*100dvh/);
  assert.match(css, /\.creator-layout \.game-stage/);
  assert.doesNotMatch(page, /<div className="control-card">/);
  assert.doesNotMatch(page, /<header className="topbar">/);
  assert.doesNotMatch(page, /<footer>/);
});

test("every course waits for its first rendered frame before starting the countdown", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /setPhase\("loading"\)/);
  assert.match(page, /onReady=\{handleCourseReady\}/);
  assert.match(page, /if \(!readyReported && generatedTexturesReady\)[\s\S]*?onReady\(runId\)/);
  assert.ok(page.indexOf("renderer.render(scene, camera);") < page.indexOf("onReady(runId);"));
  assert.match(page, /pendingLoadingRunIdRef\.current !== readyRunId/);
  assert.match(page, /setPhase\("countdown"\)/);
  assert.match(page, /phase === "loading"[\s\S]*?course-loading-overlay/);
  assert.match(page, /準備が完了するとカウントダウンが始まります/);
  assert.match(css, /\.course-loading-overlay\s*\{/);
  assert.match(css, /@keyframes course-loading-travel/);
});

test("every non-race menu hierarchy uses the shared visible touch BACK control", async () => {
  const [page, legacyTour] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/legacy-evolution-tour.tsx", import.meta.url), "utf8"),
  ]);
  const requiredMenuPhases = [
    "settings", "achievements", "time-trial-select", "time-trial-finished",
    "ultimate-gojo-select", "ultimate-gojo-finished", "cup-select", "character-select",
    "race-briefing", "course-create", "finished", "gojo-intro", "gojo-finished",
    "award-ceremony", "championship", "creator-finished", "random-quest-complete",
    "evolution-intro", "evolution-finished", "evolution-complete",
  ];
  const backSetSource = page.match(/const MENU_PHASES_WITH_BACK:[\s\S]*?= new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? "";
  for (const phase of requiredMenuPhases) assert.match(backSetSource, new RegExp(`"${phase}"`), `${phase} needs touch BACK`);
  assert.match(page, /MENU_PHASES_WITH_BACK\.has\(phase\)[\s\S]*?universal-menu-back-button[\s\S]*?← BACK/);
  assert.match(page, /!MENU_PHASES_WITH_INLINE_BACK\.has\(phase\)/);
  assert.match(page, /className="creator-exit-button"[\s\S]*?← TITLE/);
  assert.ok(legacyTour.includes('onClick={onExit}>← BACK TO TITLE</button>'));
  assert.ok(legacyTour.includes('className="legacy-tour-back" onClick={() => setScreen("select")}>BACK TO TOUR'));
  assert.ok(legacyTour.includes('className="transition-exit" onClick={onExit}>← BACK · EXIT TOUR'));
  assert.ok(legacyTour.includes('className="legacy-tour-back" onClick={onExit}>BACK TO TITLE'));
});

test("the current kart is assembled from recognizable low-poly vehicle and driver parts", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /function makeKartHoodGeometry/);
  assert.match(page, /new THREE\.BoxGeometry\(2\.48, 0\.16, 0\.25\)/);
  assert.match(page, /const wheelRadius = 0\.6/);
  assert.match(page, /const wheelCenterY = 0\.63/);
  assert.match(page, /bodyRoot\.position\.y = 0\.1/);
  assert.match(page, /new THREE\.TorusGeometry\(0\.31, 0\.045, 8, 20\)/);
  assert.match(page, /const eyeDepth = animal === "fox" \? 0\.625 : 0\.565/);
  assert.match(page, /new THREE\.SphereGeometry\(0\.068, 10, 8\)/);
  assert.match(page, /const addDriverLimbSegment =/);
  assert.match(page, /const steeringGripTarget = new THREE\.Vector3\(side \* 0\.27, 0\.24, 0\.81\)/);
  assert.match(page, /addDriverLimbSegment\(shoulder, elbow, 0\.145\)/);
  assert.match(page, /addDriverLimbSegment\(elbow, steeringGripTarget, 0\.13\)/);
  assert.doesNotMatch(page, /const fenderFront =/);
  assert.doesNotMatch(page, /const fenderRear =/);
});

test("road rendering remains smooth while low-poly environment budgets stay independent from race sampling", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /const LOW_POLY_VISUAL_DETAIL = Object\.freeze\(\{/);
  assert.match(page, /courseStripSegments: 1440/);
  assert.match(page, /courseEdgeSegments: 1440/);
  assert.match(page, /interiorDeckSegments: 480/);
  assert.match(page, /barrierSegments: 360/);
  assert.match(page, /const sampleCount = 1600/);
  assert.match(page, /const segments = LOW_POLY_VISUAL_DETAIL\.courseStripSegments/);
  assert.match(page, /scene\.userData\.lowPolyVisuals = LOW_POLY_VISUAL_DETAIL/);
  assert.doesNotMatch(page, /facetedMaterial\.flatShading = true/);
});

test("daylight glare is reduced without changing night or ship interior exposure", async () => {
  const [page, presentation] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/race-presentation.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /const RACE_DAY_EXPOSURE = 0\.9/);
  assert.match(page, /interiorExposure = pirateLapIndex === 0 \? 0\.86 : pirateLapIndex === 1 \? 0\.98 : 1\.05/);
  assert.match(page, /lerp\(RACE_DAY_EXPOSURE, 0\.98, dayToSunset\), 1\.18, sunsetToNight\)/);
  assert.match(page, /lerp\(RACE_DAY_EXPOSURE, 1\.02, stormArrival\), RACE_DAY_EXPOSURE, iceArrival\)/);
  assert.match(presentation, /scene\.environmentIntensity = 0\.18/);
  assert.doesNotMatch(presentation, /skyTint\s*\*\s*[\d.]+\s*\+\s*vec3/);
  assert.match(presentation, /bloom\.strength = boosting \? 0\.1 : 0\.07/);
});

test("player, CPU and ghosts rotate wheel pivots from their actual forward speed", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /function rotateKartWheels\(kart: Three\.Group, forwardSpeed: number, dt: number\)/);
  assert.match(page, /wheel\.rotation\.x \+= rotationDelta/);
  assert.match(page, /rotateKartWheels\(player, playerState\.speed, dt\)/);
  assert.match(page, /rotateKartWheels\(rivalMeshes\[index\], rival\.speed, dt\)/);
  assert.match(page, /rotateKartWheels\(visual\.ghost, ghostSpeed, dt\)/);
});

test("representative assets keep authored silhouettes with smoother instanced foliage", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /function makeLowPolyHullSectionGeometry/);
  assert.match(page, /const lowerShell = new THREE\.Mesh/);
  assert.match(page, /const crownShell = new THREE\.Mesh/);
  assert.match(page, /const leafGeometry = new THREE\.IcosahedronGeometry\(1, 2\)/);
  assert.match(page, /new THREE\.InstancedMesh\(leafGeometry, leafMat, treeCapacity \* 8\)/);
  assert.match(page, /const rootY = WORLD_GROUND_Y - 0\.08/);
  assert.match(page, /trunkGeometry\.translate\(0, 0\.5, 0\)/);
  assert.match(page, /new THREE\.InstancedMesh\(new THREE\.ConeGeometry\(1, 1, 12\), leafMat/);
  assert.match(page, /new THREE\.IcosahedronGeometry\(2\.4, 2\)/);
  assert.match(page, /new THREE\.SphereGeometry\(25, 32, 20\)/);
  assert.match(page, /makeLowPolyHullSectionGeometry\(THREE, 12, 17, 112\)/);
  assert.match(page, /new THREE\.SphereGeometry\(10\.1, 28, 20\)/);
  assert.doesNotMatch(page, /new THREE\.SphereGeometry\(10\.1, 40, 30\)/);
});

test("standard race results keep every racer moving and tour the finish order with a clear next-course prompt", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /let postFinishStartedAt = 0/);
  assert.match(page, /const onFinishRef = useRef\(onFinish\)/);
  assert.match(page, /onFinishRef\.current\(\{/);
  assert.doesNotMatch(page, /gamepadBindings, onFinish, onItemChange/);
  assert.match(page, /const postFinishTourActive = phaseRef\.current === "finished"/);
  assert.match(page, /const paradeSpeed = 21/);
  assert.match(page, /playerState\.progress \+= paradeAdvance/);
  assert.match(page, /rival\.progress \+= paradeAdvance/);
  assert.match(page, /const actorTourDurationMs = 6400/);
  assert.match(page, /const actorId = postFinishActorOrder\[tourIndex\]/);
  assert.match(page, /tourProgress \* TAU/);
  assert.match(page, /AUTO CAMERA TOUR · RACERS ON VICTORY LAP/);
  assert.match(page, /YOUR FINISH/);
  assert.match(page, /NEXT COURSE · \{cupCourses\[courseIndex \+ 1\]\?\.name\}/);
  assert.match(page, /ENTER \/ SPACE · × \/ A · TAP/);
  assert.match(css, /\.post-race-tour-overlay\s*\{/);
  assert.match(css, /\.post-race-tour-card\s*\{/);
  assert.match(css, /\.post-race-next-button\s*\{/);
});
