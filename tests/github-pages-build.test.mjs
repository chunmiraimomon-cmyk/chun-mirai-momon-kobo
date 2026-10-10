import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const base = "/chun-mirai-momon-kobo/";

async function outputFiles(directory = dist) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => (
    entry.isDirectory() ? outputFiles(join(directory, entry.name)) : [join(directory, entry.name)]
  )));
  return nested.flat();
}

const files = await outputFiles();
const javascript = files.filter((path) => path.endsWith(".js"));
const bundledSource = (await Promise.all(javascript.map((path) => readFile(path, "utf8")))).join("\n");

test("the GitHub Pages entry loads module and stylesheet beneath the repository subpath", async () => {
  const html = await readFile(join(dist, "index.html"), "utf8");
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /<title>MOMON GRAND PRIX: PRISM SHIFT<\/title>/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /<div id="root"><\/div>/);
  assert.doesNotMatch(html, /city-circuit-3d\.mirai-momon\.chatgpt\.site|%BASE_URL%|\/main\.tsx/);
  const assetPaths = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((match) => match[1]);
  assert.ok(assetPaths.some((path) => path.endsWith(".js")));
  assert.ok(assetPaths.some((path) => path.endsWith(".css")));
  for (const path of assetPaths) {
    assert.ok(path.startsWith(`${base}assets/`), path);
    assert.ok((await stat(join(dist, path.slice(base.length)))).isFile());
  }
  assert.ok((await stat(join(dist, ".nojekyll"))).isFile());
});

test("all public data, textures and legacy driver asset URLs resolve under the repository", async () => {
  assert.doesNotMatch(bundledSource, /["'`]\/(?:textures|data|drivers)\//);
  const assetUrls = [...new Set([...bundledSource.matchAll(/\/chun-mirai-momon-kobo\/(?:textures|data|drivers)\/[^"'`\s]+/g)].map((match) => match[0]))];
  const textureModules = await Promise.all(["app/generated-material-textures.ts", "app/backdrop-nature.ts"]
    .map((path) => readFile(join(root, path), "utf8")));
  const declaredTextures = [...new Set([...textureModules.join("\n").matchAll(/["'](\/textures\/[^"'\s]+)["']/g)]
    .map((match) => `${base}${match[1].slice(1)}`))];
  assert.ok(declaredTextures.length >= 7, "existing terrain atlases plus dedicated architecture and alpha foliage artwork");
  assert.deepEqual(assetUrls.filter((url) => url.includes("/textures/")).sort(), declaredTextures.sort());
  assert.equal(assetUrls.filter((url) => url.includes("/data/")).length, 12);
  assert.equal(assetUrls.filter((url) => url.includes("/drivers/")).length, 4);
  for (const url of assetUrls) {
    const assetPath = url.slice(base.length).split("?")[0];
    assert.ok((await stat(join(dist, assetPath))).isFile(), url);
  }
});

test("the export remains a static client build with lazy archived stages and raw shadow CSS", async () => {
  assert.ok(javascript.length >= 24, "legacy JS and raw-CSS chunks must remain lazy");
  assert.match(bundledSource, /evolution:legacy-telemetry/);
  assert.match(bundledSource, /evolution:legacy-finish/);
  assert.match(bundledSource, /__EVOLUTION_PAUSED__/);
  assert.match(bundledSource, /@import [\\]*"tailwindcss/);
  assert.match(bundledSource, /\.legacy-root \.game-hud/);
  const player = await readFile(join(root, "app/legacy-evolution-player.tsx"), "utf8");
  assert.equal([...player.matchAll(/import\("\.\.\/legacy-evolution\/v\d+\/app\/page"\)/g)].length, 12);
  for (const path of files) {
    assert.doesNotMatch(path.slice(dist.length).replaceAll("\\", "/"), /(?:^|\/)(?:server|worker|\.wrangler)(?:\/|$)|\.map$/);
  }
  const cssPaths = files.filter((path) => path.endsWith(".css"));
  const css = (await Promise.all(cssPaths.map((path) => readFile(path, "utf8")))).join("\n");
  assert.match(css, /\.expanded-game-page/);
  assert.match(css, /\.fullscreen-game-layout/);
  assert.match(css, /\.game-hud/);
  assert.match(css, /\.game-stage\.race-ui-active[^{}]*\{[^}]*overflow:\s*clip/,
    "the compiled race stage must not retain internal menu focus scrolling");
  assert.doesNotMatch(css, /@import\s+["']tailwindcss/);
});
