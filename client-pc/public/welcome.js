/* The welcome page owns no gameplay or sensor state. Connection uses the existing broker. */
const motionToggle = document.getElementById('motionToggle');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const dialog = document.getElementById('connectionDialog');
const chapters = [...document.querySelectorAll('[data-chapter]')];
const chapterLinks = [...document.querySelectorAll('.experience-rail nav a')];
let motionPaused = reducedMotion.matches;
let scene;
let dialogOpener;
let offsets = [];
let scrollFrame = 0;
let activeChapter = -1;
let progress = 0;
function updateMotion() {
  document.body.classList.toggle('motion-paused', motionPaused);
  motionToggle.textContent = motionPaused ? '▷ Play motion' : 'Ⅱ Pause motion';
  motionToggle.setAttribute('aria-pressed', String(motionPaused));
  scene?.setPaused(motionPaused || dialog.open);
}
motionToggle.addEventListener('click', () => { motionPaused = !motionPaused; updateMotion(); });
reducedMotion.addEventListener('change', event => { motionPaused = event.matches; updateMotion(); measure(); });
function measure() { offsets = chapters.map(chapter => chapter.offsetTop); updateScroll(); }
function updateScroll() {
  scrollFrame = 0;
  const y = scrollY;
  let index = 0;
  while (index < offsets.length - 1 && y >= offsets[index + 1]) index++;
  progress = index + (index === offsets.length - 1 ? 0 : Math.min(1, (y - offsets[index]) / (offsets[index + 1] - offsets[index])));
  scene?.setProgress(progress);
  document.getElementById('railProgress').style.transform = `scaleX(${Math.min(1, y / Math.max(1, document.documentElement.scrollHeight - innerHeight))})`;
  const visible = Math.min(chapters.length - 1, Math.floor(progress + .2));
  if (activeChapter !== visible) {
    activeChapter = visible;
    document.getElementById('chapterLabel').textContent = `0${visible} / ${chapters[visible].dataset.chapter}`;
    chapterLinks.forEach((link, i) => { if (i === visible) link.setAttribute('aria-current', 'step'); else link.removeAttribute('aria-current'); });
  }
}
addEventListener('scroll', () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll); }, { passive: true });
addEventListener('resize', measure);
updateMotion(); measure();
import('/pc/welcome-scene.js').then(module => module.createWelcomeScene(document.getElementById('stadium'))).then(api => {
  scene = api; scene.setProgress(progress); updateMotion();
}).catch(() => {
  document.body.classList.add('scene-fallback');
  motionToggle.hidden = true;
  document.querySelector('.scene-caption small').textContent = 'Court preview · Scroll to explore';
});
for (const button of document.querySelectorAll('[data-feed]')) button.addEventListener('click', () => {
  document.querySelectorAll('[data-feed]').forEach(item => { const selected = item === button; item.classList.toggle('selected', selected); item.setAttribute('aria-pressed', String(selected)); });
  scene?.setFeed(button.dataset.feed);
});
for (const button of document.querySelectorAll('[data-target]')) button.addEventListener('click', () => {
  document.querySelectorAll('[data-target]').forEach(item => { const selected = item === button; item.classList.toggle('selected', selected); item.setAttribute('aria-pressed', String(selected)); });
  scene?.setTarget(button.dataset.target);
});
function openConnection(event) {
  dialogOpener = event.currentTarget;
  dialog.showModal();
  document.body.style.overflow = 'hidden';
  scene?.setPaused(true);
  refreshSetup();
  document.getElementById('closeConnection').focus();
}
document.querySelectorAll('[data-connect]').forEach(button => button.addEventListener('click', openConnection));
document.getElementById('closeConnection').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
dialog.addEventListener('close', () => { document.body.style.overflow = ''; updateMotion(); dialogOpener?.focus({ preventScroll: true }); });
let refreshing = false;
let previousQr = '';
async function refreshSetup() {
  if (refreshing || document.hidden) return;
  refreshing = true;
  const badge = document.getElementById('connectionStatus');
  const message = document.getElementById('setupMessage');
  const qr = document.getElementById('expoQr');
  const placeholder = document.getElementById('qrPlaceholder');
  const link = document.getElementById('expoLink');
  try {
    const response = await fetch('/api/setup', { cache: 'no-store', signal: AbortSignal.timeout(4500) });
    if (!response.ok) throw new Error('Connection unavailable');
    const setup = await response.json();
    const connected = setup.mobileClients > 0;
    badge.textContent = connected ? 'Phone connected' : setup.ready ? 'Ready to scan' : 'Waiting for Expo';
    badge.classList.toggle('connected', connected);
    const available = Boolean(setup.ready && setup.qrSvg && setup.expoUrl?.startsWith('exp://'));
    qr.hidden = !available; placeholder.hidden = available; link.hidden = !available;
    if (available) {
      if (previousQr !== setup.qrSvg) { qr.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(setup.qrSvg); previousQr = setup.qrSvg; }
      link.href = setup.expoUrl;
    } else placeholder.textContent = 'Your QR appears here when Expo is ready.';
    message.textContent = connected ? 'Your controller is connected. Enter the court and calibrate your racket.' : available ? 'Scan with your phone to open MatchPoint in Expo Go.' : 'Run npm start on this computer. This panel updates automatically when Expo is ready.';
  } catch {
    badge.textContent = 'Server unavailable'; badge.classList.remove('connected');
    qr.hidden = true; link.hidden = true; placeholder.hidden = false;
    placeholder.textContent = 'Reconnect to show your QR.';
    message.textContent = 'Keep the MatchPoint terminal running, then refresh the connection.';
  } finally { refreshing = false; }
}
document.getElementById('retrySetup').addEventListener('click', refreshSetup);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshSetup(); });
refreshSetup();
let setupTimer = setInterval(refreshSetup, 5000);
window.addEventListener('pagehide', event => { clearInterval(setupTimer); if (!event.persisted) scene?.dispose(); });
window.addEventListener('pageshow', event => { if (event.persisted) { setupTimer = setInterval(refreshSetup, 5000); refreshSetup(); measure(); } });
