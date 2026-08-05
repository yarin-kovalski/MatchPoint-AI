const EXPLICIT_KEY = /\[([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\]/g;

export function classifyCommits(board, commits) {
  const cards = new Map(board.cards.map(card => [card.key, card]));
  const additions = [];
  const ambiguous = [];
  const ignored = [];

  for (const commit of commits) {
    if (board.cards.some(card => card.checklist.some(item => item.startsWith(commit.shortHash)))) {
      ignored.push({ commit, reason: "already recorded" });
      continue;
    }
    const keys = [...commit.subject.matchAll(EXPLICIT_KEY)].map(match => match[1]);
    const uniqueKeys = [...new Set(keys)];
    if (uniqueKeys.length === 1 && cards.has(uniqueKeys[0])) {
      additions.push({ key: uniqueKeys[0], history: `${commit.shortHash} ${commit.date} ${commit.subject}` });
      continue;
    }
    if (uniqueKeys.length) {
      ambiguous.push({ commit, candidates: uniqueKeys.filter(key => cards.has(key)), reason: "unknown or multiple explicit card keys" });
      continue;
    }
    const candidates = inferCandidates(board.cards, commit.files);
    if (candidates.length === 1) {
      additions.push({ key: candidates[0], history: `${commit.shortHash} ${commit.date} ${commit.subject}` });
    } else if (candidates.length > 1) {
      ambiguous.push({ commit, candidates, reason: "changed files match multiple cards" });
    } else {
      ignored.push({ commit, reason: "no deterministic card match" });
    }
  }
  return { additions, ambiguous, ignored };
}

export function applyCommitAdditions(board, result, head) {
  if (result.ambiguous.length) throw new Error("Ambiguous commits must be resolved before board.json can change");
  const copy = structuredClone(board);
  const cards = new Map(copy.cards.map(card => [card.key, card]));
  for (const item of result.additions) cards.get(item.key).checklist.push(item.history);
  copy.git = { ...(copy.git ?? {}), lastProcessedCommit: head };
  return copy;
}

function inferCandidates(cards, files) {
  const areas = new Set();
  for (const file of files) {
    if (/^client-pc\/src\/ball\//.test(file) || /phase-d/.test(file)) areas.add("Ball Physics");
    if (/^client-pc\/src\/strokeDetection\//.test(file) || /phase-c/.test(file)) areas.add("Stroke Detection");
    if (/^client-(mobile|pc)\/src\/motion\//.test(file) || /phase-b/.test(file)) areas.add("Mobile Sensors");
    if (/^(start\.ps1|package\.json|scripts\/)/.test(file)) areas.add("Infra & Deploy");
    if (/^docs\//.test(file)) areas.add("Docs & Course");
  }
  if (!areas.size) return [];
  return cards.filter(card => [...areas].every(area => card.labels.includes(area))).map(card => card.key);
}
