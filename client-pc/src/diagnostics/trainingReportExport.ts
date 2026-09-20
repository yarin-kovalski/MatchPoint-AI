import { classifyTrainingTiming, TrainingSessionReport, TrainingShot, TrainingStroke } from "./smartTrainingSession.js";
import type { TrainingShotStyle } from "./strokeTechniqueAnalysis.js";
import { createCourtMapSvg, CourtBounce } from "./courtVision.js";

export type TrainingReportOptions = {
  playerName?: string;
  playerFeedback?: string;
};

type StrokeReport = {
  stroke: TrainingStroke;
  attempts: number;
  hits: number;
  outs: number;
  hitRate: number;
  targetAccuracy: number;
  averageSpeed: number;
  peakSpeed: number;
  bestStreak: number;
  onTime: number;
  early: number;
  late: number;
  topspinCount: number;
  topspinLevel: number | null;
  sliceCount: number;
  sliceLevel: number | null;
  arcLevel: number | null;
  faceLevel: number | null;
  finishLevel: number | null;
  styles: Record<TrainingShotStyle, number>;
};

const STYLE_ORDER: TrainingShotStyle[] = [
  "REGULAR", "TOPSPIN", "SLICE", "DROP_SHOT", "HEAVY_TOPSPIN", "SIDE_SPIN"
];

export function createTrainingReportHtml(
  report: TrainingSessionReport,
  options: TrainingReportOptions = {}
): string {
  const playerName = options.playerName?.trim() || "Unnamed player";
  const playerFeedback = options.playerFeedback?.trim() || "No player reflection was added for this session.";
  const forehand = summarizeStroke(report.shots, "forehand");
  const backhand = summarizeStroke(report.shots, "backhand");
  const stronger = strongerStroke(forehand, backhand);
  const reportDate = new Date(report.endedAt);
  const reportId = `MP-${reportDate.toISOString().replace(/[-:TZ.]/g, "").slice(0, 12)}`;
  const outs = report.attempts - report.hits;
  const outRate = report.attempts ? Math.round(outs / report.attempts * 100) : 0;
  const classifiedCount = report.regularShots + report.topspinShots + report.sliceShots +
    report.dropShots + report.heavyTopspinShots + report.sideSpinShots;
  const overallArc = classifiedCount ? levelText(report.averageArcLevel, arcMeaning) : "No contact data";
  const overallFace = classifiedCount ? levelText(report.averageFaceOpennessLevel, faceMeaning) : "No contact data";
  const overallFinish = classifiedCount ? `${toLevel10(report.followThroughCompletion)}/10` : "No contact data";
  const topspinFamilyCount = report.topspinShots + report.heavyTopspinShots;
  const sliceFamilyCount = report.sliceShots + report.dropShots;
  const placementBounces: CourtBounce[] = report.shots.flatMap(shot =>
    shot.bouncePoint && shot.returnOutcome
      ? [{ x: shot.bouncePoint.x, z: shot.bouncePoint.z, outcome: shot.returnOutcome }]
      : []
  );
  const mappedIn = placementBounces.filter(bounce => bounce.outcome === "IN").length;
  const mappedOut = placementBounces.length - mappedIn;
  const gameResult = report.game ? `<div class="game-result"><div class="game-result-title"><span>Target cones practice · ${escapeHtml(report.game.practiceType ?? "Regular")}</span><strong>${report.game.score} points</strong></div><div class="game-result-grid">${stat("Practice focus",escapeHtml(report.game.practiceType ?? "Regular"))}${stat("Cones knocked down",String(report.game.targetsHit))}${stat("Cone hit rate",`${report.game.targetHitRate}%`)}${stat("Best cone streak",String(report.game.bestTargetStreak))}</div></div>` : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(playerName)} - MatchPoint session report</title><style>
@page{size:A4;margin:13mm}*{box-sizing:border-box}body{margin:0;background:#e9edf0;color:#17212b;font:14px/1.48 Arial,Helvetica,sans-serif}.document{width:min(1060px,calc(100% - 32px));margin:28px auto;background:#fff;box-shadow:0 18px 60px #1a273627}.masthead{padding:42px 48px 34px;background:#10263b;color:#fff;border-top:7px solid #b5ce4d}.brand{font-size:11px;font-weight:800;letter-spacing:.2em;color:#d8ea7d}.report-id{float:right;color:#aab8c4;font-size:11px}.masthead h1{margin:20px 0 23px;font:600 42px/1.05 Georgia,serif;letter-spacing:-.02em}.identity{display:grid;grid-template-columns:2fr 1.25fr .75fr;gap:22px;border-top:1px solid #496073;padding-top:17px}.identity span,.label{display:block;color:#7c8b98;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}.identity b{display:block;margin-top:4px;color:#fff;font-size:14px}.content{padding:36px 48px 48px}.section{margin-top:36px;break-inside:avoid}.section:first-child{margin-top:0}.section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:15px;border-bottom:2px solid #142b40;padding-bottom:8px}.section-head h2{margin:0;font:600 24px/1.1 Georgia,serif;color:#10263b}.section-no{color:#9aaa37;font-weight:800;letter-spacing:.13em;font-size:11px}.stat-line{display:grid;grid-template-columns:repeat(5,1fr);border:1px solid #cfd7dc}.stat{padding:17px 16px;border-left:1px solid #d9e0e4}.stat:first-child{border-left:0}.stat strong{display:block;margin-top:3px;color:#10263b;font-size:23px}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:21px}table{width:100%;border-collapse:collapse}th,td{padding:10px 9px;border-bottom:1px solid #dce2e5;text-align:left}th{color:#64737f;font-size:10px;letter-spacing:.08em;text-transform:uppercase}td:last-child,th:last-child{text-align:right;font-weight:700;color:#10263b}.subhead{margin:0 0 8px;color:#10263b;font-size:13px;text-transform:uppercase;letter-spacing:.08em}.definition{margin:13px 0 0;color:#65747f;font-size:11px}.style-grid{display:grid;grid-template-columns:repeat(6,1fr);border-top:1px solid #cfd7dc;border-bottom:1px solid #cfd7dc}.style-item{padding:14px 10px;border-left:1px solid #dce2e5}.style-item:first-child{border-left:0}.style-item b{display:block;color:#10263b;font-size:20px}.style-item span{color:#667580;font-size:11px}.stroke-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.stroke-panel{border:1px solid #bdc8cf;border-top:5px solid #173b57;padding:23px}.stroke-title{display:flex;align-items:baseline;justify-content:space-between;border-bottom:1px solid #d7dee2;padding-bottom:12px}.stroke-title h3{margin:0;font:600 25px Georgia,serif;color:#10263b}.stroke-title strong{font-size:13px;color:#526571}.compact td{padding:8px 4px}.compact td:first-child{color:#61717d}.verdict{padding:22px 24px;border-left:5px solid #adc548;background:#f4f6ec}.verdict strong{display:block;margin-bottom:5px;color:#10263b;font:600 21px Georgia,serif}.coach-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.coach{padding:20px 22px;background:#f4f6f7;border-top:3px solid #183b56}.coach h3{margin:0 0 11px;color:#10263b}.coach ul{margin:0;padding-left:18px}.coach li{margin:7px 0}.reflection{padding:23px 26px;border:1px solid #cbd4d9;background:#fafbfb}.reflection blockquote{margin:7px 0 0;font:italic 17px/1.6 Georgia,serif;color:#293846;white-space:pre-wrap}.trend{color:#53636f}.method{margin-top:35px;padding-top:16px;border-top:1px solid #cfd7dc;color:#71808b;font-size:10px}.footer{display:flex;justify-content:space-between;margin-top:18px;color:#81909a;font-size:10px}@media(max-width:760px){.document{width:100%;margin:0}.masthead,.content{padding:28px 22px}.identity,.two-col,.stroke-grid,.coach-grid{grid-template-columns:1fr}.stat-line{grid-template-columns:1fr 1fr}.stat{border-top:1px solid #d9e0e4}.style-grid{grid-template-columns:repeat(2,1fr)}}@media print{body{background:#fff}.document{width:100%;margin:0;box-shadow:none}.masthead{print-color-adjust:exact;-webkit-print-color-adjust:exact}.content{padding:25px 0 0}.section{break-inside:avoid}.stroke-panel,.coach,.reflection{break-inside:avoid}}
.placement-layout{display:grid;grid-template-columns:230px 1fr;gap:28px;align-items:center}.placement-map{max-width:210px;margin:auto;padding:12px;background:#10263b;border-radius:8px}.court-map-svg{display:block;width:100%;height:auto}.placement-copy{color:#53636f}.placement-legend{display:flex;gap:18px;margin:16px 0}.legend-item{display:flex;align-items:center;gap:7px;font-weight:700;color:#263846}.legend-dot{width:11px;height:11px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #789}.legend-in{background:#c8f268}.legend-out{background:#ff765f}@media(max-width:760px){.placement-layout{grid-template-columns:1fr}}@media print{.placement-map,.legend-dot{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
.game-result{margin-top:22px;border:1px solid #294c5c;border-top:5px solid #b5ce4d;background:#10263b;color:#fff;break-inside:avoid}.game-result-title{display:flex;justify-content:space-between;align-items:baseline;padding:16px 19px 13px}.game-result-title span{color:#d8ea7d;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.game-result-title strong{font:600 25px Georgia,serif}.game-result-grid{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid #385366}.game-result .stat{border-color:#385366}.game-result .stat span{color:#9fb0bc}.game-result .stat strong{color:#fff}@media(max-width:760px){.game-result-grid{grid-template-columns:1fr 1fr}}@media print{.game-result{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body><main class="document">
<header class="masthead"><div><span class="brand">MATCHPOINT PERFORMANCE LAB</span><span class="report-id">${reportId}</span></div><h1>Session Performance Report</h1><div class="identity"><div><span>Player</span><b>${escapeHtml(playerName)}</b></div><div><span>Session date and time</span><b>${escapeHtml(reportDate.toLocaleString(undefined,{dateStyle:"full",timeStyle:"short"}))}</b></div><div><span>Duration</span><b>${formatDuration(report.durationSeconds)}</b></div></div></header>
<div class="content">
<section class="section">${sectionHead("01","Overall session analysis")}
<div class="stat-line">${stat("Attempts",String(report.attempts))}${stat("In",`${report.hits} (${report.hitRatio}%)`)}${stat("Out",`${outs} (${outRate}%)`)}${stat("Average speed",`${report.averageSwingSpeedKmh} km/h`)}${stat("Best streak",String(report.bestStreak))}</div>
${gameResult}
<div class="two-col"><div><h3 class="subhead">Performance</h3><table>${row("Forehand / backhand",`${report.forehands} / ${report.backhands}`)}${row("On-time contact",`${report.onTimeHits}/${report.attempts} (${percentage(report.onTimeHits,report.attempts)}%)`)}${row("Peak swing",`${report.peakSwingSpeedKmh} km/h`)}${row("Target accuracy",`${report.targetAccuracy}%`)}${row("Early / late",`${report.earlyHits} / ${report.lateHits}`)}${row("Wind training",report.wind ? report.wind.conditions.join("; ") : "Off")}</table></div><div><h3 class="subhead">Technique</h3><table>${row("Topspin level (spin shots only)",topspinFamilyCount ? `${toLevel10(report.averageTopspinLevel)}/10 · ${topspinFamilyCount} ${shotWord(topspinFamilyCount)}` : "No topspin shots")}${row("Slice level (slice shots only)",sliceFamilyCount ? `${toLevel10(report.averageSliceLevel)}/10 · ${sliceFamilyCount} ${shotWord(sliceFamilyCount)}` : "No slice shots")}${row("Shot arc",overallArc)}${row("Racket face",overallFace)}${row("Far-shoulder finish",overallFinish)}</table></div></div>
<p class="definition">Racket face: 1 very closed, 5 square, 10 very open. Arc: 1-3 low, 4-7 medium, 8-10 high. Topspin and slice levels exclude unrelated shot styles.</p>
</section>
<section class="section">${sectionHead("02","First-bounce placement map")}<div class="placement-layout"><div class="placement-map">${createCourtMapSvg(placementBounces,"Session first-bounce placement map")}</div><div class="placement-copy"><h3 class="subhead">Where the ball landed</h3><p>${placementBounces.length ? `${placementBounces.length} first ${shotWord(placementBounces.length)} recorded across the full court enclosure.` : "No first-bounce positions were recorded in this session."}</p><div class="placement-legend"><span class="legend-item"><i class="legend-dot legend-in"></i>${mappedIn} in</span><span class="legend-item"><i class="legend-dot legend-out"></i>${mappedOut} out</span></div><p class="definition">Green marks an in-court first bounce. Red marks a wide, long, short, or net-affected first bounce.</p></div></div></section>
<section class="section">${sectionHead("03","Shot-style distribution")}<div class="style-grid">${styleCount("Regular",report.regularShots)}${styleCount("Topspin",report.topspinShots)}${styleCount("Slice",report.sliceShots)}${styleCount("Drop shot",report.dropShots)}${styleCount("Heavy topspin",report.heavyTopspinShots)}${styleCount("Side spin",report.sideSpinShots)}</div><p class="definition">Drop shot = sliced, reduced pace, and a bounce close to the net. Heavy topspin = strong topspin, high arc, controlled pace, and deep placement.</p></section>
<section class="section">${sectionHead("04","Forehand and backhand analysis")}<div class="stroke-grid">${strokePanel(forehand)}${strokePanel(backhand)}</div></section>
<section class="section">${sectionHead("05","Power profile and coaching")}<div class="verdict">${powerVerdict(stronger,forehand,backhand)}</div><div class="coach-grid"><div class="coach"><h3>Forehand priorities</h3>${adviceList(strokeAdvice(forehand,backhand))}</div><div class="coach"><h3>Backhand priorities</h3>${adviceList(strokeAdvice(backhand,forehand))}</div></div>${trendLine(report)}</section>
<section class="section">${sectionHead("06","Player reflection")}<div class="reflection"><span class="label">Written by ${escapeHtml(playerName)}</span><blockquote>${escapeHtml(playerFeedback)}</blockquote></div></section>
<p class="method">Measurement note: shot style, spin, racket-face angle, arc, speed, and finish are estimated from phone sensors and the simulated ball impact. Far-shoulder completion uses cross-body direction, upward travel, and orientation change; body pose is not camera-tracked.</p><div class="footer"><span>MatchPoint Smart Tennis Trainer</span><span>${reportId}</span></div>
</div></main></body></html>`;
}

function summarizeStroke(shots: TrainingShot[], stroke: TrainingStroke): StrokeReport {
  const filtered = shots.filter(shot => shot.detectedStroke === stroke);
  const techniqueShots = filtered.filter(shot => shot.technique);
  const topspin = techniqueShots.filter(shot => shot.technique!.shotStyle === "TOPSPIN" || shot.technique!.shotStyle === "HEAVY_TOPSPIN");
  const slice = techniqueShots.filter(shot => shot.technique!.shotStyle === "SLICE" || shot.technique!.shotStyle === "DROP_SHOT");
  const styles = Object.fromEntries(STYLE_ORDER.map(style => [style,0])) as Record<TrainingShotStyle,number>;
  let streak = 0;
  let bestStreak = 0;
  for (const shot of filtered) {
    if (shot.hit) { streak += 1; bestStreak = Math.max(bestStreak,streak); } else streak = 0;
    if (shot.technique) styles[shot.technique.shotStyle] += 1;
  }
  const hits = filtered.filter(shot => shot.hit).length;
  return {
    stroke, attempts:filtered.length, hits, outs:filtered.length-hits,
    hitRate:percentage(hits,filtered.length), targetAccuracy:average(filtered.map(shot=>shot.placementAccuracy)),
    averageSpeed:round1(averageRaw(filtered.map(shot=>shot.swingSpeedKmh))),
    peakSpeed:round1(Math.max(0,...filtered.map(shot=>shot.swingSpeedKmh))), bestStreak,
    onTime:filtered.filter(shot=>classifyTrainingTiming(shot.timingOffsetMs,shot.missReason)==="on-time").length,
    early:filtered.filter(shot=>classifyTrainingTiming(shot.timingOffsetMs,shot.missReason)==="early").length,
    late:filtered.filter(shot=>classifyTrainingTiming(shot.timingOffsetMs,shot.missReason)==="late").length,
    topspinCount:topspin.length, topspinLevel:conditionalAverage(topspin.map(shot=>shot.technique!.topspinLevel),true),
    sliceCount:slice.length, sliceLevel:conditionalAverage(slice.map(shot=>shot.technique!.sliceLevel),true),
    arcLevel:conditionalAverage(techniqueShots.map(shot=>shot.technique!.arcLevel),false),
    faceLevel:conditionalAverage(techniqueShots.map(shot=>shot.technique!.racketFaceOpennessLevel),false),
    finishLevel:conditionalAverage(techniqueShots.map(shot=>toLevel10(shot.technique!.followThrough.score)),false), styles
  };
}

function strokePanel(data: StrokeReport): string {
  const top = data.topspinCount ? `${toLevel10(data.topspinLevel ?? 0)}/10 · ${data.topspinCount} ${shotWord(data.topspinCount)}` : "No topspin shots";
  const slice = data.sliceCount ? `${toLevel10(data.sliceLevel ?? 0)}/10 · ${data.sliceCount} ${shotWord(data.sliceCount)}` : "No slice shots";
  return `<article class="stroke-panel"><div class="stroke-title"><h3>${capitalize(data.stroke)}</h3><strong>${data.hits}/${data.attempts} in (${data.hitRate}%)</strong></div><table class="compact">${row("Attempts / outs",`${data.attempts} / ${data.outs}`)}${row("Average / peak speed",`${data.averageSpeed} / ${data.peakSpeed} km/h`)}${row("Best streak",String(data.bestStreak))}${row("On-time contact",`${data.onTime}/${data.attempts} (${percentage(data.onTime,data.attempts)}%)`)}${row("Target accuracy",`${data.targetAccuracy}%`)}${row("Topspin level",top)}${row("Slice level",slice)}${row("Shot arc",nullableLevel(data.arcLevel,arcMeaning))}${row("Racket face",nullableLevel(data.faceLevel,faceMeaning))}${row("Far-shoulder finish",data.finishLevel===null?"No contact data":`${Math.round(data.finishLevel)}/10`)}${row("Shot mix",styleMix(data.styles))}</table></article>`;
}

function strongerStroke(forehand: StrokeReport, backhand: StrokeReport): TrainingStroke | null {
  if (!forehand.attempts && !backhand.attempts) return null;
  if (!forehand.attempts) return "backhand";
  if (!backhand.attempts) return "forehand";
  const forehandPower = forehand.averageSpeed*.7+forehand.peakSpeed*.3;
  const backhandPower = backhand.averageSpeed*.7+backhand.peakSpeed*.3;
  return forehandPower >= backhandPower ? "forehand" : "backhand";
}

function powerVerdict(stronger: TrainingStroke | null, forehand: StrokeReport, backhand: StrokeReport): string {
  if (!stronger) return "<strong>Power profile unavailable</strong>Complete forehand and backhand shots to create a comparison.";
  const winner = stronger === "forehand" ? forehand : backhand;
  const other = stronger === "forehand" ? backhand : forehand;
  const comparison = other.attempts ? `${round1(winner.averageSpeed-other.averageSpeed)} km/h faster on average than the ${other.stroke}.` : `No ${other.stroke} sample was recorded for comparison.`;
  return `<strong>${capitalize(stronger)} is the player's more powerful side</strong>${winner.averageSpeed} km/h average, ${winner.peakSpeed} km/h peak. ${comparison}`;
}

function strokeAdvice(data: StrokeReport, other: StrokeReport): string[] {
  if (!data.attempts) return [`Record at least three ${data.stroke} attempts to create reliable coaching.`];
  const notes:string[]=[];
  if (data.hitRate<55) notes.push(`Build consistency first: only ${data.hitRate}% of ${data.stroke}s landed in.`);
  if (data.early>data.late && data.early>=2) notes.push("Let the ball travel slightly closer before accelerating.");
  else if (data.late>=2) notes.push("Start the unit turn earlier to move contact farther in front.");
  else if (data.onTime>=Math.ceil(data.attempts*.55)) notes.push("Contact timing is a strength; preserve the same preparation rhythm.");
  if (data.faceLevel!==null && data.faceLevel>=7.5) notes.push("The face trends open. Move it closer to square for depth control.");
  else if (data.faceLevel!==null && data.faceLevel<=3.5) notes.push("The face trends closed. Open it slightly for safer clearance.");
  if (data.finishLevel!==null && data.finishLevel<6) notes.push("Continue the follow-through across the body and over the far shoulder.");
  if (other.attempts && data.averageSpeed+7<other.averageSpeed) notes.push(`Add smooth acceleration; this side averages ${round1(other.averageSpeed-data.averageSpeed)} km/h less than the ${other.stroke}.`);
  if (!notes.length) notes.push("This side is balanced. Increase difficulty while preserving face control and timing.");
  return notes.slice(0,3);
}

function trendLine(report: TrainingSessionReport): string {
  if (!report.improvement) return `<p class="trend">This session establishes the player's performance baseline.</p>`;
  const i=report.improvement;
  return `<p class="trend">Change from previous session: ${signed(i.hitRatioPoints)} hit-rate points, ${signed(i.targetAccuracyPoints)} accuracy points, ${signed(i.averageSpeedKmh)} km/h average speed, and ${signed(i.followThroughPoints)} finish points.</p>`;
}

function sectionHead(number:string,title:string):string{return `<div class="section-head"><h2>${title}</h2><span class="section-no">${number}</span></div>`;}
function stat(label:string,value:string):string{return `<div class="stat"><span class="label">${label}</span><strong>${escapeHtml(value)}</strong></div>`;}
function row(label:string,value:string):string{return `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`;}
function styleCount(label:string,count:number):string{return `<div class="style-item"><b>${count}</b><span>${label}</span></div>`;}
function adviceList(items:string[]):string{return `<ul>${items.map(item=>`<li>${escapeHtml(item)}</li>`).join("")}</ul>`;}
function styleMix(styles:Record<TrainingShotStyle,number>):string{const labels:Record<TrainingShotStyle,string>={REGULAR:"regular",TOPSPIN:"topspin",SLICE:"slice",DROP_SHOT:"drop",HEAVY_TOPSPIN:"heavy",SIDE_SPIN:"side"};const entries=STYLE_ORDER.filter(style=>styles[style]>0).map(style=>`${styles[style]} ${labels[style]}`);return entries.join(", ")||"No classified contacts";}
function nullableLevel(value:number|null,meaning:(level:number)=>string):string{return value===null?"No contact data":`${Math.round(value)}/10 · ${meaning(value)}`;}
function levelText(value:number,meaning:(level:number)=>string):string{return `${value}/10 · ${meaning(value)}`;}
function conditionalAverage(values:number[],percentScale:boolean):number|null{if(!values.length)return null;const value=averageRaw(values);return percentScale?value:round1(value);}
function average(values:number[]):number{return Math.round(averageRaw(values));}
function averageRaw(values:number[]):number{return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;}
function percentage(part:number,total:number):number{return total?Math.round(part/total*100):0;}
function toLevel10(percent:number):number{return Math.max(1,Math.min(10,Math.round(percent/10)));}
function arcMeaning(level:number):string{return level<=3?"Low":level<=7?"Medium":"High";}
function faceMeaning(level:number):string{return level<=2?"Very closed":level<=3?"Closed":level<5?"Slightly closed":level<6?"Square":level<7?"Slightly open":level<=8?"Open":"Very open";}
function capitalize(value:string):string{return value[0].toUpperCase()+value.slice(1);}
function shotWord(count:number):string{return count===1?"shot":"shots";}
function signed(value:number):string{return `${value>0?"+":""}${value}`;}
function round1(value:number):number{return Math.round(value*10)/10;}
function formatDuration(seconds:number):string{const minutes=Math.floor(seconds/60);return `${minutes}m ${seconds%60}s`;}
function escapeHtml(value:string):string{return value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[char]!);}
