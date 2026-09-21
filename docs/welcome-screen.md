# Cinematic welcome screen

## Acceptance criteria

- Replace the staged swing film with a continuous real-time empty stadium, ball and equipment reveal; no player or hitting animation.
- Native scrolling moves one camera through six connected chapters, with readable explanations of existing features only.
- Persistent connection access opens the runtime Expo QR; setup explains download, same Wi-Fi, scan, Connect, Start, grip and calibration.
- Distinguish illustrative telemetry and raw motion replay from measured session results or video replay.
- Preserve gameplay and sensor logic; support keyboard navigation, mobile, reduced motion, WebGL failure and slower hardware.
- Verify browser chapters, dialog/QR, PC client and regression tests; run `npm run all` through ready state and iOS bundle delivery. Report physical iPhone pairing as unverified without a device.

## Implementation

Entry: `/pc/welcome.html`, also the broker's `/` redirect. The existing launcher opens this page after Metro's iOS bundle is ready. The court remains at `/pc`.

The page has one fixed Three.js stadium and native document scrolling. Camera position and focus interpolate through court, phone/racket, flight path, cone placement, ball/spin detail and setup chapters. There is no scroll interception and no marketing video. Equipment, trajectories and technique values are explicitly illustrative; the page never starts training or writes session data. Feed and cone buttons affect only the preview.

`welcome-scene.js` reuses the court, net, racket GLB and racket materials. The surrounding night stadium, lighting, ball surface and technical geometry are procedural. `welcome.js` owns chapter navigation, motion preferences, the accessible native setup dialog and existing `/api/setup` polling. The QR comes from the launcher's real Expo address and disappears if Expo is unavailable. Download and troubleshooting links use official Expo pages. No credentials are collected here.

The existing Three.js 0.184.0 modules are served locally under `vendor/three` with their license. No animation framework, CDN, web font or video download is needed by the welcome experience. The retained older `film/` sources and `media/court-film.*` are unused by this page.

## Performance and accessibility

- Desktop pixel ratio is capped at 1.5; narrow/low-core devices use 1, no shadow maps, fewer particles and a 30 fps render limit.
- Sustained slow rendering switches to the cheaper quality mode. Static geometry and reusable render vectors limit frame allocations.
- Background tabs stop rendering. Setup dialog pauses the scene so the QR stays static. Leaving the page releases scene resources and polling.
- Motion pause and reduced motion stop autonomous animation; reduced motion also removes sticky chapter pacing and smooth anchor scrolling.
- A locally rendered empty-stadium poster remains visible when WebGL is unavailable or lost. Product text and setup continue to work.
- Native dialog supports Escape, focus containment and restoration. Navigation, preview choices and motion controls have keyboard focus states. Narrow screens use a flowing layout.

## Validation — 21 September 2026

- `npm run build`: passed.
- `npm run all`: reached ready state, opened welcome automatically, printed QR and served iOS bundles. This is a persistent launcher; it remains running rather than returning a completion exit code. Backend/Metro stderr logs were empty; Expo stdout contained only existing terminal color warnings alongside successful bundle messages.
- Browser checks passed at 390, 768, 1366 and 1440 px: six chapter views, local scene modules, no old video, previews, pause, reduced motion, repeated QR opening, Escape/focus restoration, missing-Expo recovery and WebGL fallback. No welcome console errors, failed resources or external requests.
- Actual Socket.io mobile-role handshake updated the setup badge. This is a transport check, not a claim of physical iPhone testing.
- OpenCV decoded the displayed QR to the current launcher's actual `exp://` LAN URL. PC loaded its canvas and connected its socket; single-shot, cone selection and wind controls passed a smoke check without console errors. Added the welcome icon to the PC page to resolve its previous missing-favicon error.
- Application suite: 273/278 passed, five failed. A separate clean worktree at pre-change commit `23d2758` reproduced exactly the same five failures. See `docs/risks.md`; gameplay and sensor sources were not changed for this redesign. Project-board tests: 6/6 passed.
- Physical iPhone camera scanning, Expo Go execution and real sensor motion still require a device check.

Reproducible browser check: run `node scripts/check-welcome.cjs` while `npm run all` is ready, with Playwright installed externally (and Edge available). Set `MATCHPOINT_PLAYWRIGHT_MODULE` to the external Playwright module path if it is not resolvable; optionally set `MATCHPOINT_PREVIEW_URL`. Screenshots are written to the OS temporary directory. The check uses an isolated browser and a temporary mobile-role socket, without sensor events.
