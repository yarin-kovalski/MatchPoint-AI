# Cinematic welcome screen

Acceptance criteria: startup opens a dedicated welcome page; original local tennis film plays silently behind readable content; Expo download instructions and a runtime-generated QR connect to the actual launcher address; connection status is live; the court remains accessible without pairing; guide covers calibration, feeds, cone focus, shot technique, wind, and reports; narrow screens and reduced motion work.

The welcome page is separate from the court so its film and connection polling stop when entering training. The film is an original staged demonstration rendered with the project's court and racket assets, not recorded player analytics. Render source is retained under `client-pc/public/film/`. The local launcher supplies the Expo URL to the broker; unavailable setup is displayed honestly instead of inventing an address.

Entry point: `/pc/welcome.html` (also the broker's root redirect). `npm start` opens this page after Metro is ready. Click the MatchPoint title from the court to return to setup. Setup instructions link to the official Expo download page at https://expo.dev/go.

Film: `client-pc/public/media/court-film.webm`, approximately 18 seconds at 1600×900, with a JPEG poster. To render again, run `scripts/render-welcome-film.cjs` against a local broker with Playwright and Edge installed; set `MATCHPOINT_PREVIEW_URL` and `MATCHPOINT_PLAYWRIGHT_MODULE` if needed. Rendering uses only the staged scene, with no sensor/session recording. The guide's small motion illustrations are CSS animations and pause with the film.

Validation: server/client build passed. Browser smoke checks covered 390, 768, and 1440 px widths without horizontal overflow, guide expansion, motion pause/reduced motion, court navigation, live QR availability and loss of Metro, and video byte ranges. OpenCV decoded the rendered test QR to the configured test controller URL. Physical-phone pairing still uses the existing Expo/LAN workflow and requires a device check after restarting the launcher.
