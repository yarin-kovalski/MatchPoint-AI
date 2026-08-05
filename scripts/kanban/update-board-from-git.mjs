import { execFileSync } from "node:child_process";
import { rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadBoard } from "./load-board.mjs";
import { applyCommitAdditions, classifyCommits } from "./git-history-core.mjs";

const BOARD_PATH = new URL("./board.json", import.meta.url);
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

async function main() {
  const args = new Set(process.argv.slice(2));
  const unknown = [...args].filter(arg => arg !== "--write");
  if (unknown.length) throw new Error(`Unsupported argument: ${unknown.join(", ")}`);
  const board = await loadBoard();
  const last = board.git?.lastProcessedCommit;
  if (!last) throw new Error("board.json git.lastProcessedCommit is required");
  verifyCommit(last);
  const head = git(["rev-parse", "HEAD"]).trim();
  const commits = readCommits(last, head);
  const result = classifyCommits(board, commits);
  printResult(last, head, result, args.has("--write"));
  if (result.ambiguous.length) {
    process.exitCode = 2;
    return;
  }
  if (!args.has("--write") || head === last) return;
  const updated = applyCommitAdditions(board, result, head);
  const temporary = new URL("./board.json.tmp", import.meta.url);
  await writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  await rename(temporary, BOARD_PATH);
  console.log(`Updated board.json with ${result.additions.length} unambiguous History entries.`);
}

export function readCommits(last, head) {
  if (last === head) return [];
  const output = git(["log", "--reverse", "--format=%H%x1f%h%x1f%cs%x1f%s", `${last}..${head}`]);
  return output.split(/\r?\n/).filter(Boolean).map(metadata => {
    const [hash, shortHash, date, subject] = metadata.split("\x1f");
    const files = git(["diff-tree", "--no-commit-id", "--name-only", "-r", hash]).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    return { hash, shortHash, date, subject, files };
  });
}

function verifyCommit(hash) {
  try { git(["cat-file", "-e", `${hash}^{commit}`]); }
  catch { throw new Error(`Last processed commit is not available: ${hash}. Fetch full Git history first.`); }
}
function git(args) { return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
function printResult(last, head, result, write) {
  console.log(`Git history scan: ${last.slice(0, 7)}..${head.slice(0, 7)}`);
  console.log(`Unambiguous History additions: ${result.additions.length}`);
  for (const item of result.additions) console.log(`  [${item.key}] ${item.history}`);
  console.log(`Ambiguous commits: ${result.ambiguous.length}`);
  for (const item of result.ambiguous) console.log(`  ${item.commit.shortHash} ${item.commit.subject} -> ${item.candidates.join(", ") || "no valid explicit key"} (${item.reason})`);
  console.log(`Ignored commits: ${result.ignored.length}`);
  console.log(write ? "Write mode requested." : "Read-only preview; board.json was not changed.");
}
