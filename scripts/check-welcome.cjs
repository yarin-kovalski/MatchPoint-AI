// Run against npm run all. Playwright is an optional external test tool, not an app dependency.
const { chromium } = require(process.env.MATCHPOINT_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { tmpdir } = require('node:os');
const { io } = require(process.cwd() + '/virtucourt-mobile/node_modules/socket.io-client');
const base = process.env.MATCHPOINT_PREVIEW_URL || 'http://localhost:3000';
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 let mobile;
 try {
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[]; const failed=[];const external=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  page.on('response',r=>{if(r.status()>=400)failed.push(r.status()+' '+r.url());});
  page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('data:'))external.push(r.url());});
  await page.goto(base+'/'); await page.waitForFunction(()=>document.querySelector('#stadium').dataset.ready==='true');await page.waitForTimeout(1800);
  assert.equal(await page.locator('video').count(),0);
  assert.equal(await page.locator('h1').innerText(),'ENTER YOUR GAME.');
  const api=await(await page.request.get(base+'/api/setup')).json();assert.equal(api.ready,true);
  await page.locator('.nav [data-connect]').click();await page.waitForSelector('#expoQr:not([hidden])');
  await page.locator('#expoQr').screenshot({path:tmpdir()+'/matchpoint-cinematic-qr.png'});
  await page.screenshot({path:tmpdir()+'/matchpoint-cinematic-pairing.png'});
  assert.equal(await page.locator('#expoLink').getAttribute('href'),api.expoUrl);
  assert.equal(await page.locator('#connectionDialog').evaluate(d=>d.open),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#connectionDialog').evaluate(d=>d.open),false);
  assert.equal(await page.locator('.nav [data-connect]').evaluate(b=>b===document.activeElement),true);
  await page.locator('.nav [data-connect]').click();await page.locator('#closeConnection').click();
  await page.locator('#motionToggle').click();assert.equal(await page.locator('#motionToggle').getAttribute('aria-pressed'),'true');
  for (const id of ['top','motion','practice','conditions','analysis','connect']) {
    await page.evaluate(id=>scrollTo({top:document.getElementById(id).offsetTop,behavior:'instant'}),id);await page.waitForTimeout(150);
    assert.ok(await page.locator('#'+id+' h1, #'+id+' h2').isVisible());
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'desktop overflow');
  }
  await page.evaluate(()=>scrollTo({top:document.getElementById('practice').offsetTop,behavior:'instant'}));
  await page.locator('[data-feed="spin"]').click();assert.equal(await page.locator('[data-feed="spin"]').getAttribute('aria-pressed'),'true');
  await page.evaluate(()=>scrollTo({top:document.getElementById('conditions').offsetTop,behavior:'instant'}));
  await page.locator('[data-target="short"]').click();assert.equal(await page.locator('[data-target="short"]').getAttribute('aria-pressed'),'true');
  await page.waitForTimeout(350);const a=await page.screenshot();await page.waitForTimeout(500);const b=await page.screenshot();assert.ok(a.equals(b),'paused scene should stay still');
  // Actual broker role handshake, not a mocked setup API.
  mobile=io(base,{transports:['websocket'],forceNew:true});await new Promise((resolve,reject)=>{mobile.on('connect',()=>{mobile.emit('client:hello',{role:'mobile'});resolve()});mobile.on('connect_error',reject)});
  await page.locator('.nav [data-connect]').click();await page.waitForFunction(()=>document.querySelector('#connectionStatus').textContent==='Phone connected');
  mobile.disconnect();await page.locator('#closeConnection').click();
  for (const [width,height] of [[1366,768],[768,1024],[390,844]]) {
    await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(180);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow at '+width);
    await page.screenshot({path:tmpdir()+'/matchpoint-cinematic-'+width+'.png'});
    await page.locator('.nav [data-connect]').click();assert.ok(await page.locator('#connectionDialog').evaluate(d=>d.getBoundingClientRect().width<=innerWidth));await page.locator('#closeConnection').click();
  }
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('#motionToggle').getAttribute('aria-pressed'),'true');
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(()=>scrollTo({top:document.getElementById('connect').offsetTop,behavior:'instant'}));await page.locator('.ready-panel [data-connect]').click();await page.locator('#closeConnection').click();
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(external,[]);
  // Simulate a missing GPU without failing setup or navigation.
  const fallback=await browser.newPage();const fallbackErrors=[];fallback.on('pageerror',e=>fallbackErrors.push(e.message));
  await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:original.call(this,type,...args)}});
  await fallback.goto(base+'/pc/welcome.html');await fallback.waitForSelector('body.scene-fallback');await fallback.locator('.nav [data-connect]').click();await fallback.waitForSelector('#expoQr:not([hidden])');assert.deepEqual(fallbackErrors,[]);await fallback.close();
  // Honest unavailable-Expo state and recovery; only this page's API response is overridden.
  await page.route('**/api/setup',route=>route.fulfill({json:{ready:false,mobileClients:0,qrSvg:null,expoUrl:null}}));
  await page.locator('.nav [data-connect]').click();await page.waitForFunction(()=>document.querySelector('#expoQr').hidden);assert.equal(await page.locator('#connectionStatus').textContent(),'Waiting for Expo');
  await page.unroute('**/api/setup');await page.locator('.pairing-code summary').click();await page.locator('#retrySetup').click();await page.waitForSelector('#expoQr:not([hidden])');await page.locator('#closeConnection').click();
  console.log('WELCOME PASS: 6 scenes, locally loaded 3D, interactive previews, stable pause, reduced motion, 390/768/1366/1440 layouts, repeated QR dialog, Escape/focus, real broker mobile handshake, Metro recovery, WebGL fallback. No console errors or external requests.');
  console.log('QR address:',api.expoUrl);
  // Keep errors from the existing PC client separate from welcome assertions.
  errors.length=0;failed.length=0;external.length=0;
  await page.goto(base+'/pc');await page.waitForSelector('#playCalibratedForehand');await page.waitForFunction(()=>document.querySelector('#connectionStatus').textContent.includes('connected'));await page.waitForTimeout(2000);
  assert.ok(await page.locator('canvas').count()>0);await page.locator('#playSingleShot').click();
  await page.locator('#playerAssistLevel').selectOption('game');await page.waitForSelector('#conePracticePicker:not([hidden])');await page.locator('[data-cone-practice="deep"]').click();
  await page.locator('#windButton').click();await page.locator('#windStrength').selectOption('light');
  await page.screenshot({path:tmpdir()+'/matchpoint-pc-regression.png'});
  console.log('PC load/controls:',JSON.stringify({errors,failed}));assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 } finally {mobile?.disconnect();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
