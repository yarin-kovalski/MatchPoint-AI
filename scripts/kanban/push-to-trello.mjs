import { loadBoard } from "./load-board.mjs";

const args = new Set(process.argv.slice(2));
if (args.has("--help") || args.has("-h")) {
  console.log("Usage: node scripts/kanban/push-to-trello.mjs [--check-auth]\n\nLegacy board creation has been permanently removed. --push always fails before network access.");
  process.exit(0);
}
const unknown = [...args].filter(arg => arg !== "--check-auth" && arg !== "--push");
if (unknown.length) throw new Error(`Unknown argument: ${unknown.join(", ")}`);
if (args.has("--push")) throw new Error("Board creation is permanently disabled. Use sync-trello.mjs for the existing board.");

const board = await loadBoard();
if (!args.has("--check-auth")) {
  console.log("LEGACY PUBLISHER DRY RUN - board creation is disabled");
  console.log(`Board: ${board.board.name}`);
  console.log(`Cards: ${board.cards.length}`);
  console.log("Use sync-trello.mjs to compare or update the existing board.");
  process.exit(0);
}

const key = process.env.TRELLO_KEY?.trim();
const token = process.env.TRELLO_TOKEN?.trim();
if (!key || !token) throw new Error("TRELLO_KEY and TRELLO_TOKEN environment variables are required");
const url = new URL("https://api.trello.com/1/members/me");
url.searchParams.set("fields", "id,username");
url.searchParams.set("key", key);
url.searchParams.set("token", token);
const response = await fetch(url);
if (!response.ok) throw new Error(`Trello GET /members/me failed with HTTP ${response.status}`);
const member = await response.json();
console.log(`Trello authentication valid for member: ${member.username ?? member.id}`);
console.log("Authentication check complete. No board was created or changed.");
