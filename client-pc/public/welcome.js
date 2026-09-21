const film = document.getElementById('heroFilm');
const motionToggle = document.getElementById('motionToggle');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let motionPaused = reducedMotion.matches;
function updateMotion() {
  document.body.classList.toggle('motion-paused', motionPaused);
  motionToggle.textContent = motionPaused ? '▷ Play motion' : 'Ⅱ Pause motion';
  motionToggle.setAttribute('aria-pressed', String(motionPaused));
  if (motionPaused) film.pause();
  else film.play().catch(() => { motionPaused = true; updateMotion(); });
}
motionToggle.addEventListener('click', () => { motionPaused = !motionPaused; updateMotion(); });
reducedMotion.addEventListener('change', event => { motionPaused = event.matches; updateMotion(); });
film.addEventListener('error', () => { motionToggle.hidden = true; });
updateMotion();
const filmObserver = new IntersectionObserver(([entry]) => {
  if (!entry.isIntersecting) film.pause(); else if (!motionPaused) film.play().catch(() => {});
}, { threshold: 0.05 });
filmObserver.observe(film);
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
    const available = setup.ready && setup.qrSvg && setup.expoUrl?.startsWith('exp://');
    qr.hidden = !available;
    placeholder.hidden = Boolean(available);
    link.hidden = !available;
    if (available) {
      if (previousQr !== setup.qrSvg) { qr.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(setup.qrSvg); previousQr = setup.qrSvg; }
      link.href = setup.expoUrl;
    } else placeholder.innerHTML = '<span class="qr-symbol">⌁</span><p>Your QR appears here when Expo is ready.</p>';
    message.textContent = connected ? 'Your controller is connected. Enter the court and calibrate your racket.' : available ? 'Scan with your phone to open MatchPoint in Expo Go.' : 'Run npm start on this computer. This panel will update automatically when Expo is ready.';
  } catch {
    badge.textContent = 'Server unavailable'; badge.classList.remove('connected');
    qr.hidden = true; link.hidden = true; placeholder.hidden = false;
    placeholder.textContent = 'Reconnect to show your QR.';
    message.textContent = 'Keep the MatchPoint terminal running, then refresh the connection.';
  } finally { refreshing = false; }
}
document.getElementById('retrySetup').addEventListener('click', refreshSetup);
document.addEventListener('visibilitychange', () => { if (document.hidden) film.pause(); else { refreshSetup(); if (!motionPaused) film.play().catch(() => {}); } });
refreshSetup();
const setupTimer = setInterval(refreshSetup, 5000);
window.addEventListener('pagehide', () => clearInterval(setupTimer));
