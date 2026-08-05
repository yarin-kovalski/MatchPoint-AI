import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadBoard } from "./load-board.mjs";
import { buildSyncPlan, differenceCount, makeSnapshot, planCount, planSummary } from "./trello-sync-core.mjs";

const API_BASE = "https://api.trello.com/1";
const EXPECTED_BOARD_ID = "892SCMYP";
const EXPECTED_BOARD_NAME = "MatchPoint AI \u2014 Final Project";
const STATE_PATH = new URL("./.sync-state.json", import.meta.url);
const REQUEST_DELAY_MS = 130;

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) return printHelp();
  const modes = ["--sync", "--check", "--status"].filter(flag => args.has(flag));
  const unknown = [...args].filter(arg => !modes.includes(arg));
  if (unknown.length || modes.length > 1) throw new Error("Use at most one of --sync, --check, or --status");

  const local = await loadBoard();
  const credentials = readCredentials();
  const client = createTrelloClient(credentials);
  let remote = await discoverRemoteBoard(client, credentials.boardId);
  if (args.has("--status")) return printStatus(local, remote, await loadState());

  let plan = buildSyncPlan(local, remote, await loadState());
  printPlan(plan, args.has("--sync") ? "SYNC PLAN" : "DRY-RUN PLAN");
  if (plan.errors.length || plan.conflicts.length) throw new Error("Unsafe differences detected; no remote changes were applied");
  if (args.has("--check")) {
    if (differenceCount(plan)) process.exitCode = 2;
    return;
  }
  if (!args.has("--sync")) return;

  await applyStructuralChanges(client, remote, plan);
  remote = await discoverRemoteBoard(client, credentials.boardId);
  plan = buildSyncPlan(local, remote, await loadState());
  if (plan.errors.length || plan.conflicts.length) throw new Error("Unsafe differences detected after structural synchronization");
  await applyCardChanges(client, remote, plan);
  remote = await discoverRemoteBoard(client, credentials.boardId);
  plan = buildSyncPlan(local, remote, await loadState());
  if (plan.errors.length || plan.conflicts.length) throw new Error("Unsafe differences detected after card synchronization");
  await applyHistoryAndOrdering(client, plan);

  remote = await discoverRemoteBoard(client, credentials.boardId);
  const verified = buildSyncPlan(local, remote, null);
  printPlan(verified, "POST-SYNC VERIFICATION");
  if (verified.errors.length || verified.conflicts.length || planCount(verified)) {
    throw new Error("Post-sync verification is not clean; rerun dry-run before any further action");
  }
  await writeFile(STATE_PATH, `${JSON.stringify({ ...makeSnapshot(local), boardId: remote.board.id, boardUrl: remote.board.url }, null, 2)}\n`, "utf8");
  console.log("Synchronization complete. Second plan contains zero pending changes.");
}

export async function discoverRemoteBoard(client, boardId) {
  const board = await client.get(`/boards/${encodeURIComponent(boardId)}`, { fields: "id,name,url" });
  if (board.id !== boardId && board.shortLink !== boardId) {
    // Trello may resolve a short link to the full board ID; the name check below remains authoritative.
  }
  if (board.name !== EXPECTED_BOARD_NAME) throw new Error(`Board name mismatch. Expected "${EXPECTED_BOARD_NAME}"; no changes were made.`);
  const [lists, labels, cards] = await Promise.all([
    client.get(`/boards/${board.id}/lists`, { filter: "open", fields: "id,name,pos" }),
    client.get(`/boards/${board.id}/labels`, { fields: "id,name,color" }),
    client.get(`/boards/${board.id}/cards`, { filter: "open", fields: "id,name,desc,idList,idLabels,pos,start,due,dueComplete,url", checklists: "all", checklist_fields: "id,name,pos", checkItem_fields: "id,name,state,pos" })
  ]);
  return { board, lists, labels, cards };
}

async function applyStructuralChanges(client, remote, plan) {
  for (const item of plan.createLists) await client.post(`/boards/${remote.board.id}/lists`, { name: item.name, pos: item.index === 0 ? "top" : "bottom" });
  for (const item of plan.updateListPositions) await client.put(`/lists/${item.id}`, { pos: item.pos });
  for (const label of plan.createLabels) await client.post(`/boards/${remote.board.id}/labels`, label);
  for (const label of plan.updateLabels) await client.put(`/labels/${label.id}`, { name: label.name, color: label.color });
}

async function applyCardChanges(client, remote, plan) {
  for (const item of plan.createCards) {
    await client.post("/cards", cardParams(item.card, item.desired, remote));
  }
  for (const item of plan.updateCards) {
    await client.put(`/cards/${item.id}`, updateParams(item.changes, remote));
  }
}

async function applyHistoryAndOrdering(client, plan) {
  for (const item of plan.createChecklists) {
    const checklist = await client.post("/checklists", { idCard: item.cardId, name: "History", pos: "bottom" });
    for (const name of item.items) await client.post(`/checklists/${checklist.id}/checkItems`, { name, pos: "bottom", checked: item.checked });
  }
  for (const item of plan.addChecklistItems) {
    await client.post(`/checklists/${item.checklistId}/checkItems`, { name: item.name, pos: "bottom", checked: item.checked });
  }
  for (const item of plan.updateChecklistItems) {
    await client.put(`/cards/${item.cardId}/checkItem/${item.itemId}`, { state: item.state });
  }
  for (const item of plan.updateCardPositions) await client.put(`/cards/${item.id}`, { pos: item.pos });
}

function cardParams(card, desired, remote) {
  return {
    idList: requiredId(remote.listByName.get(card.list), "list", card.list),
    name: desired.name,
    desc: desired.desc,
    idLabels: card.labels.map(name => requiredId(remote.labelByName.get(name), "label", name)).join(","),
    pos: "bottom",
    ...(desired.start ? { start: desired.start } : {}),
    ...(desired.due ? { due: desired.due } : {}),
    dueComplete: desired.dueComplete
  };
}

function updateParams(changes, remote) {
  const params = {};
  if (changes.name !== undefined) params.name = changes.name;
  if (changes.desc !== undefined) params.desc = changes.desc;
  if (changes.list !== undefined) params.idList = requiredId(remote.listByName.get(changes.list), "list", changes.list);
  if (changes.labels !== undefined) params.idLabels = changes.labels.map(name => requiredId(remote.labelByName.get(name), "label", name)).join(",");
  if (changes.start !== undefined) params.start = changes.start ?? "";
  if (changes.due !== undefined) params.due = changes.due ?? "";
  if (changes.dueComplete !== undefined) params.dueComplete = changes.dueComplete;
  return params;
}

function requiredId(value, type, name) {
  if (!value) throw new Error(`Missing remote ${type}: ${name}`);
  return value.id;
}

export function createTrelloClient({ key, token, fetchImpl = fetch }) {
  let lastRequestAt = 0;
  async function request(method, path, params = {}, retry = true) {
    if (method === "POST" && /^\/boards\/?$/.test(path)) throw new Error("Creating Trello boards is permanently disabled");
    if (method === "DELETE" || params.closed === true || params.closed === "true") throw new Error("Delete and archive operations are permanently disabled");
    const wait = Math.max(0, REQUEST_DELAY_MS - (Date.now() - lastRequestAt));
    if (wait) await delay(wait);
    const url = new URL(`${API_BASE}${path}`);
    for (const [name, value] of Object.entries({ ...params, key, token })) if (value !== undefined) url.searchParams.set(name, String(value));
    lastRequestAt = Date.now();
    const response = await fetchImpl(url, { method });
    if (response.status === 429 && retry) {
      await delay(1200);
      return request(method, path, params, false);
    }
    if (!response.ok) throw new Error(`Trello ${method} ${path} failed with HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  }
  return {
    get: (path, params) => request("GET", path, params),
    post: (path, params) => request("POST", path, params),
    put: (path, params) => request("PUT", path, params)
  };
}

function readCredentials() {
  const key = process.env.TRELLO_KEY?.trim();
  const token = process.env.TRELLO_TOKEN?.trim();
  const boardId = process.env.TRELLO_BOARD_ID?.trim();
  if (!key || !token || !boardId) throw new Error("TRELLO_KEY, TRELLO_TOKEN, and TRELLO_BOARD_ID are required as environment variables");
  if (boardId !== EXPECTED_BOARD_ID) throw new Error(`TRELLO_BOARD_ID must be ${EXPECTED_BOARD_ID}; refusing a different board`);
  return { key, token, boardId };
}

async function loadState() {
  try { return JSON.parse(await readFile(STATE_PATH, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

function printPlan(plan, heading) {
  const summary = planSummary(plan);
  console.log(`${heading} - existing board only`);
  console.log(`Board: ${plan.board.name}`);
  for (const [name, value] of Object.entries(summary)) console.log(`${name}: ${value}`);
  for (const item of plan.createLists) console.log(`CREATE list: ${item.name}`);
  for (const item of plan.createLabels) console.log(`CREATE label: ${item.name}`);
  for (const item of plan.createCards) console.log(`CREATE card [${item.card.key}]: ${item.card.name}`);
  for (const item of plan.updateCards) console.log(`UPDATE card [${item.key}]: ${Object.keys(item.changes).join(", ")}`);
  for (const item of plan.orphanedCards) console.log(`ORPHAN (manual review only): ${item.name}`);
  for (const item of plan.conflicts) console.log(`CONFLICT [${item.key}] ${item.field}: previous=${safe(item.previous)} local=${safe(item.local)} remote=${safe(item.remote)}`);
  for (const error of plan.errors) console.log(`ERROR: ${error}`);
  if (!planCount(plan)) console.log("No pending changes.");
}

function printStatus(local, remote, state) {
  console.log(`Board: ${remote.board.name}`);
  console.log(`URL: ${remote.board.url}`);
  for (const list of local.lists) console.log(`${list}: ${remote.cards.filter(card => remote.lists.find(item => item.id === card.idList)?.name === list).length}`);
  console.log(`Last successful sync: ${state?.syncedAt ?? "not recorded locally"}`);
}
function safe(value) { return JSON.stringify(value); }
function delay(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }
function printHelp() {
  console.log("Usage: node scripts/kanban/sync-trello.mjs [--check | --status | --sync]\n\nDefault: read-only dry-run plan.\n--check: read-only; exits non-zero when differences exist.\n--status: read-only board counts and last local sync.\n--sync: applies the plan to the existing board only. Never creates a board or deletes/archives cards.");
}
