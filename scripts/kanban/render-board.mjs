import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadBoard } from "./load-board.mjs";

const board = await loadBoard();
const labelMap = new Map(board.labels.map(label => [label.name, label.color]));
const lists = board.lists.map(list => ({ list, cards: board.cards.filter(card => card.list === list) }));
const output = new URL("./board.html", import.meta.url);

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(board.board.name)}</title>
<style>
:root{font-family:Inter,Segoe UI,Arial,sans-serif;color:#172b4d;background:#0b66a3}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:linear-gradient(135deg,#075b97,#0b78bd)}
header{padding:20px 24px 12px;color:white}h1{margin:0 0 7px;font-size:25px;letter-spacing:0}header p{max-width:1050px;margin:0;color:#d9efff;line-height:1.45;font-size:13px}
.summary{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px}.summary span{padding:5px 9px;border-radius:4px;background:#ffffff22;font-size:12px;font-weight:700}
.board{display:grid;grid-template-columns:repeat(5,minmax(270px,1fr));gap:12px;align-items:start;padding:10px 16px 28px;overflow-x:auto}.list{background:#ebecf0;border-radius:7px;padding:10px;box-shadow:0 4px 12px #00385d44;max-height:calc(100vh - 145px);overflow-y:auto}.list h2{margin:2px 4px 11px;font-size:15px;display:flex;justify-content:space-between}.count{color:#5e6c84;font-weight:500}.card{background:white;border-radius:5px;padding:10px;margin-bottom:9px;box-shadow:0 1px 2px #091e4240}.card h3{font-size:14px;margin:6px 0 7px;line-height:1.3}.labels{display:flex;gap:4px;flex-wrap:wrap}.label{height:7px;min-width:43px;border-radius:3px}.dates{font-size:11px;color:#5e6c84;margin:6px 0}.desc{font-size:12px;line-height:1.42;color:#344563;margin:7px 0}.history{border-top:1px solid #dfe1e6;padding-top:7px;margin-top:8px}.history strong{font-size:11px}.history ul{padding-left:17px;margin:5px 0 0}.history li{font:10.5px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace;margin-bottom:3px}.empty{color:#6b778c;font-size:12px;padding:4px}
.green{background:#4bce97}.black{background:#282e33}.yellow{background:#f5cd47}.blue{background:#579dff}.red{background:#f87168}.purple{background:#9f8fef}.orange{background:#fea362}.sky{background:#6cc3e0}.lime{background:#94c748}
@media(max-width:1100px){.board{grid-template-columns:repeat(5,300px)}}
</style></head><body><header><h1>${escapeHtml(board.board.name)}</h1><p>${escapeHtml(board.board.desc)}</p><div class="summary">${lists.map(({ list, cards }) => `<span>${escapeHtml(list)}: ${cards.length}</span>`).join("")}</div></header>
<main class="board">${lists.map(({ list, cards }) => `<section class="list"><h2>${escapeHtml(list)} <span class="count">${cards.length}</span></h2>${cards.length ? cards.map(renderCard).join("") : '<p class="empty">No cards</p>'}</section>`).join("")}</main></body></html>`;

await writeFile(output, html, "utf8");
console.log(`Rendered ${fileURLToPath(output)}`);

function renderCard(card) {
  const dates = [card.start ? `Start ${formatDate(card.start)}` : "", card.due ? `Due ${formatDate(card.due)}` : ""].filter(Boolean).join(" · ");
  return `<article class="card"><div class="labels">${card.labels.map(label => `<span class="label ${labelMap.get(label)}" title="${escapeHtml(label)}"></span>`).join("")}</div><h3>${escapeHtml(card.name)}</h3>${dates ? `<div class="dates">${dates}</div>` : ""}<p class="desc">${escapeHtml(card.desc)}</p>${card.checklist.length ? `<div class="history"><strong>History</strong><ul>${card.checklist.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` : ""}</article>`;
}

function formatDate(value) { return value.slice(0, 10); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
