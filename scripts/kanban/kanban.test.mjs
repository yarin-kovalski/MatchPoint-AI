import assert from "node:assert/strict";
import test from "node:test";
import { buildSyncPlan, planCount, withKeyMarker } from "./trello-sync-core.mjs";
import { applyCommitAdditions, classifyCommits } from "./git-history-core.mjs";
import { createTrelloClient } from "./sync-trello.mjs";

test("repeated synchronization produces zero changes", () => {
  const { local, remote } = fixture();
  assert.equal(planCount(buildSyncPlan(local, remote)), 0);
  assert.equal(planCount(buildSyncPlan(local, structuredClone(remote))), 0);
});

test("moving a keyed card updates it instead of creating a duplicate", () => {
  const { local, remote } = fixture();
  local.cards[0].list = "Done";
  const plan = buildSyncPlan(local, remote);
  assert.equal(plan.createCards.length, 0);
  assert.equal(plan.updateCards.length, 1);
  assert.deepEqual(plan.updateCards[0].changes.list, "Done");
  assert.equal(plan.updateCards[0].id, "card-1");
});

test("ambiguous commits do not modify board data", () => {
  const { local } = fixture();
  const before = JSON.stringify(local);
  const result = classifyCommits(local, [{ hash: "abc", shortHash: "abcdef0", date: "2026-08-05", subject: "adjust automation [CARD-ONE] [UNKNOWN-CARD]", files: ["scripts/kanban/a.mjs"] }]);
  assert.equal(result.ambiguous.length, 1);
  assert.throws(() => applyCommitAdditions(local, result, "abc"), /Ambiguous commits/);
  assert.equal(JSON.stringify(local), before);
});

test("explicit card keys match commits deterministically", () => {
  const { local } = fixture();
  const result = classifyCommits(local, [{ hash: "abc", shortHash: "abcdef0", date: "2026-08-05", subject: "feat: work [CARD-ONE]", files: ["anything"] }]);
  assert.equal(result.ambiguous.length, 0);
  assert.equal(result.additions[0].key, "CARD-ONE");
});

test("credentials never appear in client errors", async () => {
  const client = createTrelloClient({ key: "secret-key", token: "secret-token", fetchImpl: async () => ({ ok: false, status: 401 }) });
  await assert.rejects(client.get("/members/me"), error => {
    assert.doesNotMatch(error.message, /secret-key|secret-token/);
    assert.match(error.message, /HTTP 401/);
    return true;
  });
});

test("creating a new board is permanently blocked", async () => {
  let called = false;
  const client = createTrelloClient({ key: "key", token: "token", fetchImpl: async () => { called = true; } });
  await assert.rejects(client.post("/boards", { name: "duplicate" }), /permanently disabled/);
  assert.equal(called, false);
});

function fixture() {
  const local = {
    board: { name: "MatchPoint AI \u2014 Final Project" },
    git: { lastProcessedCommit: "base" },
    lists: ["To Do", "Done"],
    labels: [{ name: "Docs & Course", color: "yellow" }, { name: "Infra & Deploy", color: "black" }],
    cards: [{ key: "CARD-ONE", list: "To Do", name: "First task", labels: ["Docs & Course"], desc: "Description", checklist: [] }]
  };
  const remote = {
    board: { id: "board", name: local.board.name, url: "https://trello.example/board" },
    lists: [{ id: "todo", name: "To Do", pos: 16384 }, { id: "done", name: "Done", pos: 32768 }],
    labels: [{ id: "docs", name: "Docs & Course", color: "yellow" }, { id: "infra", name: "Infra & Deploy", color: "black" }],
    cards: [{ id: "card-1", idList: "todo", idLabels: ["docs"], name: "First task", desc: withKeyMarker("Description", "CARD-ONE"), pos: 16384, start: null, due: null, dueComplete: false, checklists: [] }]
  };
  return { local, remote };
}
