import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const expectedControls = [
  ["recordForehandAttempt", "Record Forehand Attempt"],
  ["recordBackhandAttempt", "Record Backhand Attempt"],
  ["analyzeLastAttempt", "Analyze Last Attempt"],
  ["replayLastDiagnostic", "Replay Last Diagnostic"],
  ["downloadLastDiagnostic", "Download Last Diagnostic"]
] as const;

test("PC source exposes diagnostic controls beside the existing recorder", async () => {
  const html = await readFile("client-pc/public/index.html", "utf8");
  const oldRecorderEnd = html.indexOf('id="stopReplayButton"');
  const ballPanelStart = html.indexOf('class="ball-panel"');

  assert.ok(oldRecorderEnd >= 0);
  assert.ok(ballPanelStart > oldRecorderEnd);
  for (const [id, label] of expectedControls) {
    const controlPosition = html.indexOf(`id="${id}"`);
    assert.ok(controlPosition > oldRecorderEnd && controlPosition < ballPanelStart, `${id} must remain above ball controls`);
    assert.match(html, new RegExp(`id="${id}"[^>]*>${label}</button>`));
  }
  assert.match(html, /id="diagnosticStatus"/);
  assert.match(html, /Connect Expo Go before recording/);
});

test("PC runtime binds and asserts every diagnostic control", async () => {
  const source = await readFile("client-pc/src/main.ts", "utf8");

  for (const [id] of expectedControls) {
    assert.match(source, new RegExp(`getElement<[^>]+>\\("${id}"\\)`));
    assert.match(source, new RegExp(`"${id}"`));
  }
  assert.match(source, /assertDiagnosticElements\(\)/);
  assert.match(source, /mobileClientCount === 1/);
  assert.match(source, /DIAGNOSTIC_PACKET_FRESHNESS_MS/);
});
