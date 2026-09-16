import { classifyTrainingTiming, TrainingSessionReport, TrainingShot } from "./smartTrainingSession.js";

export function createTrainingReportHtml(report: TrainingSessionReport): string {
  const ranked = report.shots.map(shot => ({ shot, score: scoreShot(shot) }));
  const best = ranked.length ? [...ranked].sort((a, b) => b.score - a.score)[0].shot : null;
  const focus = ranked.length > 1
    ? [...ranked].filter(entry => entry.shot !== best).sort((a, b) => a.score - b.score)[0].shot
    : null;
  const date = new Date(report.endedAt);
  const change = report.improvement;
  const improvement = change
    ? metric("Hit ratio change", signed(change.hitRatioPoints, " pts")) +
      metric("Accuracy change", signed(change.targetAccuracyPoints, " pts")) +
      metric("Racket-face change", signed(change.faceOpennessPoints, " levels")) +
      metric("Shoulder finish change", signed(change.followThroughPoints, " pts"))
    : `<p class="empty">This is your first recorded session. It becomes the baseline for your next report.</p>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MatchPoint session report</title><style>
:root{color-scheme:dark;--ink:#f7f5e9;--muted:#9fb3ac;--panel:#10231f;--lime:#cbe98a;--line:#34534a;--good:#8ee5ae;--warn:#ffc978}*{box-sizing:border-box}body{margin:0;background:#07120f;color:var(--ink);font:16px/1.5 Inter,Segoe UI,Arial,sans-serif}.page{max-width:1040px;margin:auto;padding:46px 28px 70px}.hero{padding:38px;border:1px solid var(--line);border-radius:28px;background:linear-gradient(135deg,#17382f,#0d1d19);box-shadow:0 24px 80px #0007}.eyebrow{color:var(--lime);font-size:12px;font-weight:800;letter-spacing:.2em;text-transform:uppercase}h1{font-size:clamp(38px,7vw,72px);line-height:1;margin:12px 0}.lead{max-width:700px;color:#c5d1cd;font-size:18px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:22px}.metric,.shot,.section{border:1px solid var(--line);background:var(--panel);border-radius:18px;padding:20px}.metric span{display:block;color:var(--muted);font-size:13px}.metric strong{display:block;margin-top:5px;font-size:25px}.metric small{color:var(--muted)}.section{margin-top:18px}.section h2{margin:0 0 16px;font-size:24px}.bar{height:9px;margin-top:10px;border-radius:99px;background:#254139;overflow:hidden}.bar i{display:block;height:100%;width:var(--v);background:linear-gradient(90deg,#70d09a,#cbe98a,#efc866)}.shot-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.shot h3{margin:0}.good{color:var(--good)}.focus{color:var(--warn)}.facts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.fact{padding:9px 0;border-top:1px solid #29463e}.fact span{display:block;color:var(--muted);font-size:12px}.fact b{font-size:15px}.coaching li{margin:8px 0;color:#d5dedb}.note,.empty{color:var(--muted)}footer{margin-top:22px;color:#71877f;font-size:12px}@media(max-width:760px){.grid{grid-template-columns:1fr 1fr}.shot-grid{grid-template-columns:1fr}.hero{padding:26px}}@media print{body{background:#fff;color:#14231f}.page{padding:16px}.hero,.metric,.shot,.section{box-shadow:none;break-inside:avoid}}
</style></head><body><main class="page">
<header class="hero"><div class="eyebrow">MatchPoint &middot; Smart Tennis Trainer</div><h1>Session report</h1><p class="lead">${escapeHtml(date.toLocaleString())} &middot; ${formatDuration(report.durationSeconds)} &middot; ${report.attempts} shots</p>
<div class="grid">${metric("In-court shots", `${report.hits}/${report.attempts} (${report.hitRatio}%)`)}${metric("Target accuracy", `${report.targetAccuracy}%`)}${metric("Average speed", `${report.averageSwingSpeedKmh} km/h`)}${metric("Best streak", String(report.bestStreak))}</div></header>
<section class="section"><div class="eyebrow">Technique profile</div><h2>How the racket moved</h2><div class="grid">${levelMetric("Topspin", toLevel10(report.averageTopspinLevel), intensityMeaning(toLevel10(report.averageTopspinLevel)))}${levelMetric("Slice", toLevel10(report.averageSliceLevel), intensityMeaning(toLevel10(report.averageSliceLevel)))}${levelMetric("Racket face", report.averageFaceOpennessLevel, faceMeaning(report.averageFaceOpennessLevel))}${levelMetric("Shot arc", report.averageArcLevel, arcMeaning(report.averageArcLevel))}</div><div class="grid">${levelMetric("Far-shoulder finish", toLevel10(report.followThroughCompletion), "completion")}${metric("Forehand / backhand", `${report.forehands} / ${report.backhands}`)}${metric("On-time contact", `${report.onTimeHits}/${report.attempts}`)}${metric("Peak swing", `${report.peakSwingSpeedKmh} km/h`)}</div><p class="note">Racket-face scale: 1 is very closed, 5 is square, and 10 is very open. Arc scale: 1-3 low, 4-7 medium, and 8-10 high.</p></section>
<section class="section"><div class="eyebrow">Progress</div><h2>Change from previous session</h2><div class="grid">${improvement}</div></section>
<section class="section"><div class="eyebrow">Shot study</div><h2>Learn from your motion</h2><div class="shot-grid">${shotCard(best,"Strong example","good")}${focus ? shotCard(focus,"Focus example","focus") : `<article class="shot"><h3>More evidence needed</h3><p class="note">Complete at least two shots to compare a strong example with a shot to improve.</p></article>`}</div></section>
<section class="section coaching"><div class="eyebrow">Coach's notes</div><h2>Next-session priorities</h2><ul>${report.feedback.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
<p class="note">Spin, racket-face angle, swing path, arc, and speed are estimates from phone sensors plus the simulated ball impact. Far-shoulder completion estimates the cross-body finish from phone direction, upward travel, and orientation change; body pose is not tracked in this proof of concept.</p>
<footer>Generated locally by MatchPoint. This report contains no external scripts or tracking.</footer></main></body></html>`;
}

function shotCard(shot: TrainingShot | null, title: string, tone: string): string {
  if (!shot) return `<article class="shot"><h3>${title}</h3><p class="note">No recorded shot.</p></article>`;
  const t = shot.technique;
  const outcome = shot.hit ? "In" : shot.missReason?.replace(/_/g, " ") ?? "Miss";
  const spinLevel = t ? toLevel10(t.spinLevel) : 0;
  return `<article class="shot"><div class="eyebrow ${tone}">${title}</div><h3>${capitalize(shot.detectedStroke)} &middot; <span class="${shot.hit ? "good" : "focus"}">${escapeHtml(outcome)}</span></h3><div class="facts">
${fact("Swing speed", `${Math.round(shot.swingSpeedKmh)} km/h`)}${fact("Contact timing", timingLabel(shot))}${fact("Target accuracy", `${shot.placementAccuracy}%`)}${fact("Spin", t ? `${spinLabel(t.spinType)} - ${intensityMeaning(spinLevel)} ${spinLevel}/10` : "No impact data")}
${fact("Racket face at contact", t ? `${t.racketFaceOpennessLabel} ${t.racketFaceOpennessLevel}/10 (${signedDegrees(t.racketFaceOpenDegrees)})` : "No impact data")}${fact("Swing path", t ? t.brushDirection : "No impact data")}${fact("Shot arc", t ? `${t.arcLabel} ${t.arcLevel}/10` : "No impact data")}${fact("Ending of shot", t ? `${t.followThrough.label} ${toLevel10(t.followThrough.score)}/10` : "No follow-through data")}
</div><p class="note">${escapeHtml(shotLesson(shot))}</p></article>`;
}

function shotLesson(shot: TrainingShot): string {
  const t = shot.technique;
  if (t && t.racketFaceOpennessLevel >= 8) return "The racket face was very open at contact. Move it closer to square for more control over launch and depth.";
  if (t && t.racketFaceOpennessLevel <= 3) return "The racket face was closed at contact. Open it slightly to improve net clearance.";
  if (!shot.hit) return `This shot finished ${shot.missReason?.replace(/_/g, " ").toLowerCase() ?? "out"}. ${t && t.followThrough.score < 55 ? "Carry the racket through the ball and finish over the far shoulder." : "Repeat the preparation with more controlled direction and arc."}`;
  if (t && t.topspinLevel >= 55 && t.followThrough.finishedAcrossFarShoulder) return "Keep this near-square contact, low-to-high path, and complete finish as your repeatable topspin model.";
  if (t && t.followThrough.score < 55) return "The ball landed in, but the finish stopped early. Continue across the body and over the far shoulder.";
  return "Use this successful in-court contact as a reference for timing, face angle, and racket speed.";
}

function scoreShot(shot: TrainingShot): number {
  const timing = classifyTrainingTiming(shot.timingOffsetMs, shot.missReason);
  const t = shot.technique;
  const controlledFace = t ? 10 - Math.abs(t.racketFaceOpennessLevel - 5) * 2 : 0;
  return (shot.hit ? 40 : 0) + shot.placementAccuracy * .25 + (timing === "on-time" ? 12 : 0) +
    (t?.contactQuality ?? 0) * .08 + (t?.followThrough.score ?? 0) * .1 + controlledFace;
}

function levelMetric(label: string, level: number, meaning: string): string {
  const safe = Math.max(1, Math.min(10, Math.round(level)));
  return `<div class="metric"><span>${label}</span><strong>${safe}/10</strong><small>${escapeHtml(meaning)}</small><div class="bar"><i style="--v:${safe * 10}%"></i></div></div>`;
}

function metric(label: string, value: string): string { return `<div class="metric"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`; }
function fact(label: string, value: string): string { return `<div class="fact"><span>${label}</span><b>${escapeHtml(value)}</b></div>`; }
function signed(value: number, suffix: string): string { return `${value > 0 ? "+" : ""}${value}${suffix}`; }
function signedDegrees(value: number): string { return `${value > 0 ? "+" : ""}${value} deg`; }
function capitalize(value: string): string { return value[0].toUpperCase() + value.slice(1); }
function spinLabel(value: string): string { return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
function timingLabel(shot: TrainingShot): string { return classifyTrainingTiming(shot.timingOffsetMs, shot.missReason).replace("on-time", "On time").replace(/^\w/, c => c.toUpperCase()); }
function formatDuration(seconds: number): string { const minutes = Math.floor(seconds / 60); return `${minutes}m ${seconds % 60}s`; }
function toLevel10(percent: number): number { return Math.max(1, Math.min(10, Math.round(percent / 10))); }
function intensityMeaning(level: number): string { return level <= 2 ? "Very low" : level <= 4 ? "Low" : level <= 7 ? "Medium" : "High"; }
function arcMeaning(level: number): string { return level <= 3 ? "Low" : level <= 7 ? "Medium" : "High"; }
function faceMeaning(level: number): string { return level <= 2 ? "Very closed" : level <= 3 ? "Closed" : level < 5 ? "Slightly closed" : level < 6 ? "Square" : level < 7 ? "Slightly open" : level <= 8 ? "Open" : "Very open"; }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]!); }
