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
      metric("Under-ball change", signed(change.underBallPoints, " pts")) +
      metric("Shoulder finish change", signed(change.followThroughPoints, " pts"))
    : `<p class="empty">This is your first recorded session. It becomes the baseline for your next report.</p>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MatchPoint session report</title><style>
:root{color-scheme:dark;--ink:#f7f5e9;--muted:#9fb3ac;--panel:#10231f;--panel2:#17332b;--lime:#cbe98a;--line:#34534a;--good:#8ee5ae;--warn:#ffc978}*{box-sizing:border-box}body{margin:0;background:#07120f;color:var(--ink);font:16px/1.5 Inter,Segoe UI,Arial,sans-serif}.page{max-width:1040px;margin:auto;padding:46px 28px 70px}.hero{padding:38px;border:1px solid var(--line);border-radius:28px;background:linear-gradient(135deg,#17382f,#0d1d19);box-shadow:0 24px 80px #0007}.eyebrow{color:var(--lime);font-size:12px;font-weight:800;letter-spacing:.2em;text-transform:uppercase}h1{font-size:clamp(38px,7vw,72px);line-height:1;margin:12px 0}.lead{max-width:700px;color:#c5d1cd;font-size:18px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:22px}.metric,.shot,.section{border:1px solid var(--line);background:var(--panel);border-radius:18px;padding:20px}.metric span{display:block;color:var(--muted);font-size:13px}.metric strong{display:block;margin-top:5px;font-size:25px}.section{margin-top:18px}.section h2{margin:0 0 16px;font-size:24px}.bar{height:9px;margin-top:10px;border-radius:99px;background:#254139;overflow:hidden}.bar i{display:block;height:100%;width:var(--v);background:linear-gradient(90deg,#7aca9a,var(--lime))}.shot-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.shot h3{margin:0}.good{color:var(--good)}.focus{color:var(--warn)}.facts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.fact{padding:9px 0;border-top:1px solid #29463e}.fact span{display:block;color:var(--muted);font-size:12px}.fact b{font-size:15px}.coaching li{margin:8px 0;color:#d5dedb}.note,.empty{color:var(--muted)}footer{margin-top:22px;color:#71877f;font-size:12px}@media(max-width:760px){.grid{grid-template-columns:1fr 1fr}.shot-grid{grid-template-columns:1fr}.hero{padding:26px}}@media print{body{background:#fff;color:#14231f}.page{padding:16px}.hero,.metric,.shot,.section{box-shadow:none;break-inside:avoid}}
</style></head><body><main class="page">
<header class="hero"><div class="eyebrow">MatchPoint · Smart Tennis Trainer</div><h1>Session report</h1><p class="lead">${escapeHtml(date.toLocaleString())} · ${formatDuration(report.durationSeconds)} · ${report.attempts} shots</p>
<div class="grid">${metric("In-court shots", `${report.hits}/${report.attempts} (${report.hitRatio}%)`)}${metric("Target accuracy", `${report.targetAccuracy}%`)}${metric("Average speed", `${report.averageSwingSpeedKmh} km/h`)}${metric("Best streak", String(report.bestStreak))}</div></header>
<section class="section"><div class="eyebrow">Technique profile</div><h2>How the racket moved</h2><div class="grid">${levelMetric("Topspin", report.averageTopspinLevel)}${levelMetric("Slice", report.averageSliceLevel)}${levelMetric("Under the ball", report.averageUnderBallScore)}${levelMetric("Far-shoulder finish", report.followThroughCompletion)}</div><div class="grid">${metric("Average arc apex", `${report.averageArcHeightMeters} m`)}${metric("Forehand / backhand", `${report.forehands} / ${report.backhands}`)}${metric("On-time contact", `${report.onTimeHits}/${report.attempts}`)}${metric("Peak swing", `${report.peakSwingSpeedKmh} km/h`)}</div></section>
<section class="section"><div class="eyebrow">Progress</div><h2>Change from previous session</h2><div class="grid">${improvement}</div></section>
<section class="section"><div class="eyebrow">Shot study</div><h2>Learn from your motion</h2><div class="shot-grid">${shotCard(best,"Strong example","good")}${focus ? shotCard(focus,"Focus example","focus") : `<article class="shot"><h3>More evidence needed</h3><p class="note">Complete at least two shots to compare a strong example with a shot to improve.</p></article>`}</div></section>
<section class="section coaching"><div class="eyebrow">Coach's notes</div><h2>Next-session priorities</h2><ul>${report.feedback.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
<p class="note">Spin, swing path, arc, and speed are estimates from phone sensors plus the simulated ball impact. Far-shoulder completion estimates the cross-body finish from phone direction, upward travel, and orientation change; body pose is not tracked in this proof of concept.</p>
<footer>Generated locally by MatchPoint. This report contains no external scripts or tracking.</footer></main></body></html>`;
}

function shotCard(shot: TrainingShot | null, title: string, tone: string): string {
  if (!shot) return `<article class="shot"><h3>${title}</h3><p class="note">No recorded shot.</p></article>`;
  const t = shot.technique;
  const outcome = shot.hit ? "In" : escapeHtml(shot.missReason?.replace(/_/g, " ") ?? "Miss");
  return `<article class="shot"><div class="eyebrow ${tone}">${title}</div><h3>${capitalize(shot.detectedStroke)} · <span class="${shot.hit ? "good" : "focus"}">${outcome}</span></h3><div class="facts">
${fact("Swing speed", `${Math.round(shot.swingSpeedKmh)} km/h`)}${fact("Contact timing", timingLabel(shot))}${fact("Target accuracy", `${shot.placementAccuracy}%`)}${fact("Spin", t ? `${spinLabel(t.spinType)} · ${t.spinLevel}% (${t.spinRpm} rpm)` : "No impact data")}
${fact("Racket path", t ? `${t.brushDirection} · ${t.swingPathAngleDegrees}°` : "No impact data")}${fact("Under the ball", t ? `${t.underBallScore}%` : "No impact data")}${fact("Shot arc", t ? `${t.launchAngleDegrees}° · ${t.apexHeightMeters} m apex` : "No impact data")}${fact("Ending of shot", t ? `${t.followThrough.label} · ${t.followThrough.score}%` : "No follow-through data")}
</div><p class="note">${escapeHtml(shotLesson(shot))}</p></article>`;
}

function shotLesson(shot: TrainingShot): string {
  const t = shot.technique;
  if (!shot.hit) return `This shot finished ${shot.missReason?.replace(/_/g, " ").toLowerCase() ?? "out"}. ${t && t.followThrough.score < 55 ? "Carry the racket through the ball and finish over the far shoulder." : "Repeat the same preparation with more controlled direction and arc."}`;
  if (t && t.topspinLevel >= 55 && t.underBallScore >= 50 && t.followThrough.finishedAcrossFarShoulder) return "Keep this low-to-high brush and complete finish as your repeatable model.";
  if (t && t.followThrough.score < 55) return "The ball landed in, but the finish stopped early. Continue across the body and over the far shoulder.";
  return "Use this successful in-court contact as a reference for timing and racket speed.";
}

function scoreShot(shot: TrainingShot): number {
  const timing = classifyTrainingTiming(shot.timingOffsetMs, shot.missReason);
  const t = shot.technique;
  return (shot.hit ? 40 : 0) + shot.placementAccuracy * .25 + (timing === "on-time" ? 12 : 0) +
    (t?.contactQuality ?? 0) * .1 + (t?.followThrough.score ?? 0) * .13;
}

function levelMetric(label: string, value: number): string {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  return `<div class="metric"><span>${label}</span><strong>${safe}%</strong><div class="bar"><i style="--v:${safe}%"></i></div></div>`;
}

function metric(label: string, value: string): string { return `<div class="metric"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`; }
function fact(label: string, value: string): string { return `<div class="fact"><span>${label}</span><b>${escapeHtml(value)}</b></div>`; }
function signed(value: number, suffix: string): string { return `${value > 0 ? "+" : ""}${value}${suffix}`; }
function capitalize(value: string): string { return value[0].toUpperCase() + value.slice(1); }
function spinLabel(value: string): string { return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
function timingLabel(shot: TrainingShot): string { return classifyTrainingTiming(shot.timingOffsetMs, shot.missReason).replace("on-time", "On time").replace(/^\w/, c => c.toUpperCase()); }
function formatDuration(seconds: number): string { const minutes = Math.floor(seconds / 60); return `${minutes}m ${seconds % 60}s`; }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]!); }
