# Known-Good MatchPoint Version

## Recovery Name

**Known-good large-racket gameplay version**

When the user asks to "go back to the good situation", "restore the known-good
version", or "restore the large-racket version", use the commit recorded below.

## Verified Commit

- Commit: `bd6aa15db24623ac270e936f2b15f7f7205a1558`
- Short commit: `bd6aa15`
- Recovery tag: `known-good-large-racket`
- Date: `2026-08-07 12:19:28 +0300`
- Message: `feat(gameplay): stabilize ball physics and high-speed stroke tracking [BALL-D4-STABILITY-AND-STROKE-FIDELITY]`

This version was manually confirmed to have the desired racket size and working
gameplay. It was also verified with a successful TypeScript build, 159
application tests, and 6 Kanban automation tests.

## Important Warning

Do not run `git stash pop` or apply the stash named below when restoring this
version:

```text
backup before restoring bd6aa15 (2026-08-12)
```

That stash contains the later unwanted small-racket implementation. Keep it only
as an emergency backup unless the user explicitly asks to recover that work.

## Safe Recovery Procedure

First inspect and preserve any new work:

```powershell
git status
git stash push --include-untracked -m "backup before known-good recovery"
```

Then restore the recorded commit:

```powershell
git switch main
git reset --hard known-good-large-racket
npm run build
npm test
npm run all
```

`git reset --hard` must only be used after current changes have been backed up
and the user has explicitly requested this recovery. Do not delete existing
stashes.

## Expected Result

- The desktop racket and calibration ghost use the confirmed larger visual size.
- The validated forehand and backhand gameplay from the recorded commit remain
  available.
- `git status` reports a clean working tree immediately after recovery.
- The project starts with `npm run all`.

## Remote Backup

The commit and recovery tag should remain pushed to `origin` so they can be
recovered even if the local repository is lost:

```powershell
git push origin main
git push origin known-good-large-racket
```
