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
  assert.match(css, /grid-template-columns:\s*minmax\(340px, 28%\)\s+minmax\(0, 1fr\)/);
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

test("visual racket sampling continues independently of analytics rejection", () => {
  const poseValidation = main.indexOf("latestVisualPoseValid = incomingPoseValid");
  const resamplerAdd = main.indexOf("sensorResampler.add({", poseValidation);
  const analyticsGate = main.indexOf("if (processedFrame.valid)", poseValidation);
  assert.ok(poseValidation >= 0 && resamplerAdd > poseValidation && analyticsGate > resamplerAdd);
  assert.match(main, /adaptiveVisualSmoothingFactor\([\s\S]*?latestVisualPoseValid/);
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
  assert.match(html, /id="playerAssistLevel"/);
  assert.match(html, /<option value="training" selected>Training<\/option>/);
  assert.match(html, /<option value="game">Target Game<\/option>/);
  assert.match(html, /id="modeDescription"/);
  for (const id of ["gameHud", "gameTimer", "gameScore", "gameTargetsHit", "gameStreak", "gameLastAward"]) {
    assert.doesNotMatch(html, new RegExp(`id=["']${id}["']`), `${id} should not be shown during play`);
    assert.doesNotMatch(main, new RegExp(`getElement(?:<[^>]+>)?\\(["']${id}["']\\)`), `${id} should not be bound`);
  }
  assert.match(main, /scoreGameBounce\(bouncePoint, result, activeGameTargets\)/);
  assert.match(main, /sessionIncludedGameMode/);
  assert.match(html, /<option value="low" selected>Low<\/option>/);
  assert.match(html, /<details class="developer-panel">/);
  assert.doesNotMatch(html, /<details class="developer-panel" open>/);
  assert.match(html, /Developer \/ Advanced/);
});

test("saved contact positions stay active after calibration controls are removed", () => {
  assert.doesNotMatch(html, /contactCalibrationPanel|saveContactCalibration|Mark Forehand|Mark Backhand/);
  assert.match(main, /loadContactPositionCalibration\(localStorage, "forehand"\)/);
  assert.match(main, /loadContactPositionCalibration\(localStorage, "backhand"\)/);
  assert.match(main, /applyContactPositionCalibration\([\s\S]*?contactPositionCalibrations\[strokeType\]/);
  assert.doesNotMatch(css, /\.contact-calibration-pad/);
});

test("smart trainer exposes live motion metrics and session feedback controls", () => {
  for (const id of [
    "trainerDetectedStroke", "trainerSwingSpeed", "trainerTiming", "trainerAccuracy",
    "trainerHitRatio", "trainerStrokeCounts", "trainerAverageSpeed", "trainerBestStreak",
    "trainerShotStyle", "trainerSpinMeter", "trainerFaceMeter", "trainerArcMeter", "trainerFinishMeter",
    "trainingReportPlayerName", "trainingReportPlayerFeedback",
    "finishTrainingSession", "newTrainingSession", "downloadTrainingReport",
    "trainingSessionReport", "trainerReportBreakdown", "trainerFeedbackList"
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /Target Game scores only the observed first bounce inside an active target/);
  assert.match(html, /1 closed .* 5 square .* 10 open/);
  assert.match(css, /@keyframes trainer-meter-rise/);
  assert.match(main, /strokeType: event\.expectedStrokeType, confidence: 1, source: "feed-side"/);
});

test("saved slice profiles remain active after calibration controls are removed", () => {
  for (const id of [
    "sliceCalibrationStroke", "calibrateDropSlice", "calibrateDeepSlice", "resetSliceCalibration",
    "dropSliceCalibrationCount", "deepSliceCalibrationCount", "sliceCalibrationReadiness", "sliceCalibrationStatus"
  ]) {
    assert.doesNotMatch(html, new RegExp(`id="${id}"`));
    assert.ok(!main.includes(`("${id}")`), `${id} must not remain bound`);
  }
  assert.doesNotMatch(css, /\.slice-calibration/);
  assert.match(main, /loadSliceCalibration\(localStorage\)/);
  assert.match(main, /classifyCalibratedSlice\(motion, sliceCalibrationData\)/);
  assert.doesNotMatch(main, /function startSliceCalibration|function captureSliceCalibrationShot/);
});

test("court vision is bound to first-bounce data", () => {
  for (const id of ["courtVision", "courtVisionMap", "courtVisionResult"]) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.match(main, new RegExp(`getElement(?:<[^>]+>)?\\("${id}"\\)`));
  }
  assert.match(main, /updateCourtVision\(result, firstBouncePoint\)/);
  assert.match(css, /\.court-vision\s*\{/);
  assert.doesNotMatch(html, /courtVisionDetail|Fence contact before first bounce/);
});

test("narrow fallback stacks panels without horizontal overflow", () => {
  assert.match(css, /@media \(max-width:\s*1000px\)/);
  assert.match(css, /@media \(max-width:\s*1000px\)[\s\S]*?\.app-shell\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(css, /@media \(max-width:\s*1000px\)[\s\S]*?overflow-x:\s*hidden/s);
  assert.match(css, /\.visualization-panel\s*\{[^}]*min-width:\s*0/s);
});
