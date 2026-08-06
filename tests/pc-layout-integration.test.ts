import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const html = readFileSync("client-pc/public/index.html", "utf8");
const css = readFileSync("client-pc/public/styles.css", "utf8");
const main = readFileSync("client-pc/src/main.ts", "utf8");

test("desktop workspace orders controls before an isolated visualization panel", () => {
  const controls = html.indexOf('class="hud control-panel"');
  const visualization = html.indexOf('id="visualizationPanel"');
  const canvas = html.indexOf('id="sceneCanvas"');
  assert.ok(controls >= 0 && visualization > controls);
  assert.ok(canvas > visualization);
  assert.match(css, /grid-template-columns:\s*minmax\(420px, 40%\)\s+minmax\(0, 60%\)/);
});

test("desktop page is fixed while the left panel owns vertical scrolling", () => {
  assert.match(css, /html,\s*\nbody\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.app-shell\s*\{[^}]*height:\s*100vh[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.control-panel\.hud\s*\{[^}]*overflow-x:\s*hidden[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.visualization-panel\s*\{[^}]*overflow:\s*hidden/s);
});

test("renderer observes and sizes from the visualization panel", () => {
  assert.match(main, /new ResizeObserver\(resizeRendererToVisualizationPanel\)/);
  assert.match(main, /visualizationResizeObserver\.observe\(visualizationPanel\)/);
  assert.match(main, /visualizationPanel\.getBoundingClientRect\(\)/);
  assert.match(main, /renderer\.setSize\(width, height, false\)/);
  assert.doesNotMatch(main, /renderer\.setSize\(window\.innerWidth/);
});

test("primary calibration and diagnostic bindings remain present", () => {
  for (const id of [
    "recordForehandAttempt", "recordBackhandAttempt", "analyzeLastAttempt",
    "replayLastDiagnostic", "downloadLastDiagnostic", "guaranteedForehandFeed",
    "guaranteedBackhandFeed", "useCalibratedFeeds", "captureForehandContact",
    "captureBackhandContact", "previewCalibratedFeed", "saveForehandTrajectory",
    "saveBackhandTrajectory", "trajectorySideView", "trajectoryTopView", "trajectoryPlayerView"
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `${id} must remain in the page`);
    assert.match(main, new RegExp(`getElement(?:<[^>]+>)?\\(["']${id}["']\\)`), `${id} must remain bound`);
  }
});

test("player mode exposes simple play controls and keeps advanced tools collapsed", () => {
  for (const label of ["Play Forehand", "Play Backhand", "Stop"]) assert.match(html, new RegExp(`>${label}<`));
  assert.match(html, /id="calibratedPracticeLoopToggle"[^>]*> Practice Loop/);
  assert.match(html, /id="feedVariationLevel"/);
  assert.match(html, /<option value="low" selected>Low<\/option>/);
  assert.match(html, /<details class="developer-panel">/);
  assert.doesNotMatch(html, /<details class="developer-panel" open>/);
  assert.match(html, /Developer \/ Advanced/);
});

test("narrow fallback stacks panels without horizontal overflow", () => {
  assert.match(css, /@media \(max-width:\s*1000px\)/);
  assert.match(css, /@media \(max-width:\s*1000px\)[\s\S]*?\.app-shell\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(css, /@media \(max-width:\s*1000px\)[\s\S]*?overflow-x:\s*hidden/s);
  assert.match(css, /\.visualization-panel\s*\{[^}]*min-width:\s*0/s);
});
