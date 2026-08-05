import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const historyPattern = /^[0-9a-f]{7,} \d{4}-\d{2}-\d{2} .+/;
const cardKeyPattern = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;

export async function loadBoard(path = new URL("./board.json", import.meta.url)) {
  const data = JSON.parse(await readFile(path, "utf8"));
  validateBoard(data);
  return sortTimelineLists(data);
}

export function validateBoard(data) {
  if (!data?.board?.name || !Array.isArray(data.lists) || !Array.isArray(data.labels) || !Array.isArray(data.cards)) {
    throw new Error("board.json must contain board, lists, labels, and cards");
  }
  if (!/^[0-9a-f]{40}$/.test(data.git?.lastProcessedCommit ?? "")) {
    throw new Error("board.json git.lastProcessedCommit must be a full 40-character Git commit hash");
  }
  const lists = new Set(data.lists);
  const labels = new Set(data.labels.map(label => label.name));
  const cardKeys = new Set();
  if (lists.size !== data.lists.length) throw new Error("List names must be unique");
  if (labels.size !== data.labels.length) throw new Error("Label names must be unique");

  for (const [index, card] of data.cards.entries()) {
    const context = `Card ${index + 1} (${card.name ?? "unnamed"})`;
    if (!cardKeyPattern.test(card.key ?? "")) throw new Error(`${context}: key must be an uppercase, hyphenated stable ID`);
    if (cardKeys.has(card.key)) throw new Error(`${context}: duplicate card key ${card.key}`);
    cardKeys.add(card.key);
    if (!lists.has(card.list)) throw new Error(`${context}: unknown list ${card.list}`);
    if (!card.name || !card.desc || !Array.isArray(card.labels) || !Array.isArray(card.checklist)) {
      throw new Error(`${context}: name, desc, labels, and checklist are required`);
    }
    for (const label of card.labels) {
      if (!labels.has(label)) throw new Error(`${context}: unknown label ${label}`);
    }
    const start = parseOptionalDate(card.start, `${context} start`);
    const due = parseOptionalDate(card.due, `${context} due`);
    if (start !== null && due !== null && start > due) throw new Error(`${context}: start must be before or equal to due`);
    if ((card.list === "Done" || card.list === "Cancelled / Parked") && (start === null || due === null)) {
      throw new Error(`${context}: historical cards require commit-derived start and due dates`);
    }
    if ((card.list === "Done" || card.list === "Cancelled / Parked") && card.checklist.some(item => !historyPattern.test(item))) {
      throw new Error(`${context}: historical checklist entries must use <hash> <date> <subject>`);
    }
  }
  return data;
}

function parseOptionalDate(value, context) {
  if (value === undefined) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${context}: invalid ISO date`);
  return parsed;
}

function sortTimelineLists(data) {
  const timelineLists = new Set(["Done", "Cancelled / Parked"]);
  const authoredIndex = new Map(data.cards.map((card, index) => [card, index]));
  data.cards.sort((left, right) => {
    if (left.list !== right.list) return authoredIndex.get(left) - authoredIndex.get(right);
    if (!timelineLists.has(left.list)) return authoredIndex.get(left) - authoredIndex.get(right);
    return Date.parse(left.start) - Date.parse(right.start) || Date.parse(left.due) - Date.parse(right.due) || authoredIndex.get(left) - authoredIndex.get(right);
  });
  return data;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const board = await loadBoard(process.argv[2]);
  const counts = Object.fromEntries(board.lists.map(list => [list, board.cards.filter(card => card.list === list).length]));
  console.log(`Valid board: ${board.board.name}`);
  console.log(JSON.stringify(counts, null, 2));
}
