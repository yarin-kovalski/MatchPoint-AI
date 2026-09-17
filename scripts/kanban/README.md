# MatchPoint AI Kanban Automation

This board was reconstructed retrospectively from the repository's Git history as an accurate project record. Trello card creation timestamps do not represent the original implementation dates; each card's start, due date, and `History` checklist preserve the evidence-backed development timeline.

This directory synchronizes `board.json` with the existing Trello board:

- Board: MatchPoint AI — Final Project
- URL: https://trello.com/b/892SCMYP/matchpoint-ai-final-project
- Board short ID: `892SCMYP`

The synchronizer never creates a Trello board and never deletes or archives cards. Unexpected remote cards are reported as orphans for manual review.

## Local environment

Set credentials only in the current shell. Never add them to a file or Git:

```powershell
$env:TRELLO_KEY = "your-api-key"
$env:TRELLO_TOKEN = "your-user-token"
$env:TRELLO_BOARD_ID = "892SCMYP"
```

Read-only commands:

```powershell
node scripts/kanban/sync-trello.mjs
npm run kanban:check
npm run kanban:status
```

`kanban:check` exits non-zero when local and remote data differ. The default synchronizer prints a dry-run plan and changes nothing.

The local end-to-end command scans Git, updates only unambiguous History entries, renders `board.html`, and prints the Trello dry run:

```powershell
npm run kanban:sync
```

Apply an approved plan to the existing board:

```powershell
npm run kanban:sync -- --sync
```

## Cards and commits

Every card requires an immutable, unique uppercase `key`. To add a card, add it to `board.json` with its key, list, name, description, labels, dates where applicable, and `checklist` array. To move a card, change only its `list`; synchronization updates the same keyed Trello card.

Reference the card key in commit subjects for deterministic History matching:

```text
feat(ball): finish readable ball delivery [BALL-D1-READABILITY]
```

Unkeyed commits are matched only when changed project areas identify exactly one card. Ambiguous commits stop before `board.json` is modified. Commits never move cards to Done automatically; completion remains an explicit reviewed board change.

## Conflicts and state

The local `.sync-state.json` records the last successful field values and environment-specific Trello IDs. It is ignored by Git and contains no credentials. If both Trello and `board.json` change the same field after a recorded sync, the synchronizer prints the previous, local, and remote values and stops. Resolve the values manually, run the dry run again, and use `--sync` only after review.

History uses one checklist named `History`. Missing entries are appended; entries are never removed automatically. Duplicate History checklists or unexpected items stop synchronization.

## GitHub Actions secrets

In GitHub, open the repository and select **Settings > Secrets and variables > Actions > New repository secret**. Add these three repository secrets:

1. `TRELLO_KEY`: the Trello Power-Up API key.
2. `TRELLO_TOKEN`: the authorized Trello user token.
3. `TRELLO_BOARD_ID`: `892SCMYP`.

The `Sync Kanban` workflow runs on pushes to `main` affecting project, documentation, or kanban files, and can be run manually from **Actions > Sync Kanban > Run workflow**. It uses `contents: read`, full Git history, Node.js 20, tests, and a concurrency lock.

To disable automation, disable the workflow from its GitHub Actions page or remove/rename `.github/workflows/sync-kanban.yml`. Removing the Trello secrets also makes synchronization fail closed.

## Credential revocation

Treat the user token like a password. Revoke it from Trello account authorization settings and regenerate the API key/token from the Trello Power-Up administration page if either is exposed. Replace the GitHub secrets afterward; never paste credentials into issues, logs, screenshots, commits, or this README.

## Legacy publisher warning

`push-to-trello.mjs --push` originally created duplicate boards. Its creation path is now disabled and must not be re-enabled or used. All ongoing work must target the existing board through `sync-trello.mjs`.
