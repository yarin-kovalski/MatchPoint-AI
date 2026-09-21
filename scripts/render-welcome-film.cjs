// Optional asset build tool. Requires Playwright (set MATCHPOINT_PLAYWRIGHT_MODULE
// to its module path when installed outside this repo) and a running local broker.
const { chromium } = require(process.env.MATCHPOINT_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
async function main() {
  const browser = await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  try {
    const page = await browser.newPage({viewport:{width:1600,height:900}});
    page.on('pageerror',error=>console.error(error.message));
    // Render against the installed Three.js version; no CDN is needed to build the film.
    await page.route('https://unpkg.com/three@0.184.0/**', async route=> {
      const relative = new URL(route.request().url()).pathname.split('/three@0.184.0/')[1];
      await route.fulfill({path:path.resolve('node_modules/three',relative),contentType:'text/javascript'});
    });
    await page.goto(`${process.env.MATCHPOINT_PREVIEW_URL || 'http://localhost:3100'}/pc/film/court-film.html`);
    await page.waitForFunction(()=>window.filmReady,{},{timeout:60000});
    await fs.mkdir('client-pc/public/media',{recursive:true});
    await page.evaluate(()=>window.renderFilmFrame(1));
    await page.screenshot({path:'client-pc/public/media/court-film-poster.jpg',type:'jpeg',quality:90});
    const movie = await page.evaluate(async()=> {
      const canvas=document.querySelector('canvas');
      const stream=canvas.captureStream(30);
      const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:4200000});
      const chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
      const done=new Promise(resolve=>{recorder.onstop=async()=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};});
      recorder.start();const started=performance.now();
      await new Promise(resolve=>{function tick(now){const t=(now-started)/1000;window.renderFilmFrame(t);if(t<18)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});
      recorder.stop();stream.getTracks().forEach(track=>track.stop());return done;
    });
    await fs.writeFile('client-pc/public/media/court-film.webm',Buffer.from(movie,'base64'));
    console.log('Created original 18-second court film and poster.');
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
