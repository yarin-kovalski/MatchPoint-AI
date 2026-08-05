const KEY_PATTERN = /(?:^|\n)Kanban-Key:\s*([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\s*(?=\n|$)/g;
const COMPLETE_LISTS = new Set(["Done", "Cancelled / Parked"]);
const CARD_FIELDS = ["name", "desc", "list", "labels", "start", "due", "dueComplete"];

export function extractCardKeys(description = "") {
  return [...description.matchAll(KEY_PATTERN)].map(match => match[1]);
}

export function withKeyMarker(description = "", key) {
  const body = description.split(/\r?\n/).filter(line => !/^Kanban-Key:\s*/.test(line)).join("\n").trimEnd();
  return `${body}${body ? "\n\n" : ""}Kanban-Key: ${key}`;
}

export function desiredCard(card) {
  return {
    name: card.name,
    desc: withKeyMarker(card.desc, card.key),
    list: card.list,
    labels: [...card.labels].sort(),
    start: normalizeDate(card.start),
    due: normalizeDate(card.due),
    dueComplete: COMPLETE_LISTS.has(card.list)
  };
}

export function remoteCardValue(card, remote) {
  const listName = remote.listById.get(card.idList)?.name ?? null;
  const labels = card.idLabels.map(id => remote.labelById.get(id)?.name).filter(Boolean).sort();
  return {
    name: card.name,
    desc: card.desc ?? "",
    list: listName,
    labels,
    start: normalizeDate(card.start),
    due: normalizeDate(card.due),
    dueComplete: Boolean(card.dueComplete)
  };
}

export function indexRemote(remote) {
  remote.listById = new Map(remote.lists.map(list => [list.id, list]));
  remote.listByName = groupUnique(remote.lists, item => item.name, "list");
  remote.labelById = new Map(remote.labels.map(label => [label.id, label]));
  remote.labelByName = groupUnique(remote.labels, item => item.name, "label");
  remote.cardByKey = new Map();
  remote.cardByTitle = new Map();
  remote.indexErrors = [];
  for (const card of remote.cards) {
    const keys = extractCardKeys(card.desc ?? "");
    if (keys.length > 1) remote.indexErrors.push(`Card "${card.name}" has multiple Kanban-Key markers`);
    if (keys.length === 1) {
      if (remote.cardByKey.has(keys[0])) remote.indexErrors.push(`Kanban-Key ${keys[0]} appears on multiple cards`);
      remote.cardByKey.set(keys[0], card);
    }
    remote.cardByTitle.set(card.name, [...(remote.cardByTitle.get(card.name) ?? []), card]);
  }
  return remote;
}

export function buildSyncPlan(local, rawRemote, snapshot = null) {
  const remote = indexRemote(rawRemote);
  const plan = {
    board: remote.board,
    createLists: [], updateListPositions: [], unexpectedLists: [],
    createLabels: [], updateLabels: [], unexpectedLabels: [],
    createCards: [], updateCards: [], updateCardPositions: [],
    createChecklists: [], addChecklistItems: [], updateChecklistItems: [], orphanedCards: [],
    conflicts: [], errors: [...remote.indexErrors]
  };

  for (const [index, name] of local.lists.entries()) {
    const found = remote.listByName.get(name);
    if (!found) plan.createLists.push({ name, index });
  }
  plan.unexpectedLists = remote.lists.filter(list => !local.lists.includes(list.name));
  const currentListOrder = remote.lists.filter(list => local.lists.includes(list.name)).sort(byPosition).map(list => list.name);
  const existingDesiredLists = local.lists.filter(name => remote.listByName.has(name));
  if (!equal(currentListOrder, existingDesiredLists)) {
    existingDesiredLists.forEach((name, index) => plan.updateListPositions.push({ id: remote.listByName.get(name).id, name, pos: position(index) }));
  }

  for (const label of local.labels) {
    const found = remote.labelByName.get(label.name);
    if (!found) plan.createLabels.push(label);
    else if (found.color !== label.color) plan.updateLabels.push({ id: found.id, name: label.name, color: label.color });
  }
  plan.unexpectedLabels = remote.labels.filter(label => label.name && !local.labels.some(item => item.name === label.name));

  const matchedRemoteIds = new Set();
  const matched = new Map();
  for (const localCard of local.cards) {
    let remoteCard = remote.cardByKey.get(localCard.key);
    if (!remoteCard) {
      const titleMatches = remote.cardByTitle.get(localCard.name) ?? [];
      if (titleMatches.length > 1) {
        plan.errors.push(`Ambiguous title fallback for ${localCard.key}: ${titleMatches.length} cards named "${localCard.name}"`);
        continue;
      }
      if (titleMatches.length === 1 && extractCardKeys(titleMatches[0].desc ?? "").length) {
        plan.errors.push(`Title fallback for ${localCard.key} points to a card with another key`);
        continue;
      }
      remoteCard = titleMatches[0];
    }
    if (!remoteCard) {
      plan.createCards.push({ card: localCard, desired: desiredCard(localCard) });
      continue;
    }
    matchedRemoteIds.add(remoteCard.id);
    matched.set(localCard.key, remoteCard);
    const desired = desiredCard(localCard);
    const actual = remoteCardValue(remoteCard, remote);
    const changes = {};
    for (const field of CARD_FIELDS) {
      if (equal(desired[field], actual[field])) continue;
      const previous = snapshot?.cards?.[localCard.key]?.[field];
      if (previous !== undefined && !equal(previous, desired[field]) && !equal(previous, actual[field]) && !equal(desired[field], actual[field])) {
        plan.conflicts.push({ key: localCard.key, field, previous, local: desired[field], remote: actual[field] });
      } else {
        changes[field] = desired[field];
      }
    }
    if (Object.keys(changes).length) plan.updateCards.push({ id: remoteCard.id, key: localCard.key, name: localCard.name, changes });
    planHistory(localCard, remoteCard, plan);
  }
  plan.orphanedCards = remote.cards.filter(card => !matchedRemoteIds.has(card.id));

  for (const listName of local.lists) {
    const desiredKeys = local.cards.filter(card => card.list === listName).map(card => card.key);
    const currentKeys = remote.cards
      .filter(card => remote.listById.get(card.idList)?.name === listName && extractCardKeys(card.desc ?? "").length === 1)
      .sort(byPosition).map(card => extractCardKeys(card.desc)[0]).filter(key => desiredKeys.includes(key));
    const existingDesiredKeys = desiredKeys.filter(key => matched.has(key) && remote.listById.get(matched.get(key).idList)?.name === listName);
    if (!equal(currentKeys, existingDesiredKeys)) {
      existingDesiredKeys.forEach((key, index) => plan.updateCardPositions.push({ id: matched.get(key).id, key, list: listName, pos: position(index) }));
    }
  }
  return plan;
}

function planHistory(localCard, remoteCard, plan) {
  const histories = (remoteCard.checklists ?? []).filter(checklist => checklist.name === "History");
  if (histories.length > 1) {
    plan.errors.push(`Card ${localCard.key} has multiple History checklists`);
    return;
  }
  if (!localCard.checklist.length) return;
  if (!histories.length) {
    plan.createChecklists.push({ cardId: remoteCard.id, key: localCard.key, items: localCard.checklist, checked: COMPLETE_LISTS.has(localCard.list) });
    return;
  }
  const history = histories[0];
  const existing = new Map((history.checkItems ?? []).map(item => [item.name, item]));
  for (const item of localCard.checklist) {
    if (!existing.has(item)) {
      plan.addChecklistItems.push({ checklistId: history.id, key: localCard.key, name: item, checked: COMPLETE_LISTS.has(localCard.list) });
    } else {
      const expectedState = COMPLETE_LISTS.has(localCard.list) ? "complete" : "incomplete";
      if (existing.get(item).state !== expectedState) {
        plan.updateChecklistItems.push({ cardId: remoteCard.id, itemId: existing.get(item).id, key: localCard.key, state: expectedState });
      }
    }
  }
  for (const item of history.checkItems ?? []) {
    if (!localCard.checklist.includes(item.name)) plan.errors.push(`Unexpected History item on ${localCard.key}: ${item.name}`);
  }
}

export function planCount(plan) {
  return ["createLists", "updateListPositions", "createLabels", "updateLabels", "createCards", "updateCards", "updateCardPositions", "createChecklists", "addChecklistItems", "updateChecklistItems"]
    .reduce((sum, key) => sum + plan[key].length, 0);
}

export function differenceCount(plan) {
  return planCount(plan) + plan.unexpectedLists.length + plan.unexpectedLabels.length + plan.orphanedCards.length + plan.conflicts.length + plan.errors.length;
}

export function planSummary(plan) {
  return {
    pendingChanges: planCount(plan),
    listsCreated: plan.createLists.length,
    labelsCreated: plan.createLabels.length,
    cardsCreated: plan.createCards.length,
    cardsUpdated: plan.updateCards.length,
    cardMoves: plan.updateCards.filter(item => item.changes.list !== undefined).length,
    historyItemsAdded: plan.createChecklists.reduce((sum, item) => sum + item.items.length, 0) + plan.addChecklistItems.length,
    historyItemsUpdated: plan.updateChecklistItems.length,
    unexpectedLists: plan.unexpectedLists.length,
    unexpectedLabels: plan.unexpectedLabels.length,
    orphanedCards: plan.orphanedCards.length,
    conflicts: plan.conflicts.length,
    errors: plan.errors.length
  };
}

export function makeSnapshot(local) {
  return {
    version: 1,
    syncedAt: new Date().toISOString(),
    cards: Object.fromEntries(local.cards.map(card => [card.key, desiredCard(card)]))
  };
}

function groupUnique(items, select, type) {
  const map = new Map();
  for (const item of items) {
    const key = select(item);
    if (map.has(key)) throw new Error(`Duplicate remote ${type} name: ${key}`);
    map.set(key, item);
  }
  return map;
}
function normalizeDate(value) { return value ? new Date(value).toISOString() : null; }
function equal(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function byPosition(left, right) { return Number(left.pos) - Number(right.pos); }
function position(index) { return (index + 1) * 16384; }
