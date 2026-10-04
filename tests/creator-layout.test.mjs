import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("course creator uses the full viewport without a separate title or side column", () => {
  assert.doesNotMatch(page, /phase === "course-create" && \(\s*<section className="race-intro"/);
  assert.doesNotMatch(page, /<aside className="race-panel creator-guide-panel">/);
  assert.match(css, /\.creator-page \{[^}]*height: 100dvh[^}]*padding: 0/);
  assert.match(css, /\.creator-layout \{[^}]*display: block[^}]*width: 100vw[^}]*height: 100dvh/);
  assert.match(css, /\.creator-layout \.game-stage \{[^}]*height: 100dvh[^}]*min-height: 0/);
  assert.equal((css.match(/\.creator-page \.creator-layout \.game-stage \{ height: 100dvh; min-height: 0; \}/g) ?? []).length, 2);
});

test("creator help overlays the course and can be collapsed", () => {
  assert.match(page, /<details className="creator-guide-overlay" open>/);
  assert.match(page, /<summary><span>GUIDE &amp; MAP<\/span>/);
  assert.match(page, /<CreatorMiniMap parts=\{creatorParts\}/);
  assert.match(css, /\.creator-guide-overlay \{[^}]*position: absolute[^}]*background: rgba\(4,25,35,\.62\)/);
});

test("creator controls use translucent panels so the course remains visible", () => {
  assert.match(css, /\.creator-head-panel, \.creator-endpoint-panel, \.creator-panel \{[\s\S]*?rgba\(5,29,41,\.74\)[\s\S]*?rgba\(4,21,31,\.66\)/);
  assert.match(css, /\.course-creator-overlay \{[\s\S]*?rgba\(3,18,27,\.06\)/);
});
