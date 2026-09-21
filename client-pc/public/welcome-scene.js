// Welcome-only scene. No sockets, sensors, gameplay state or shot simulation.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createAuthenticCourt, createAuthenticTennisNet } from './assets/scene/tennisEnvironment.js';
import { finishPremiumRacket } from './assets/scene/premiumVisuals.js';

export async function createWelcomeScene(host) {
  const compact = matchMedia('(max-width: 700px)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lowPower = compact || (navigator.hardwareConcurrency || 8) <= 4;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2', { antialias: !lowPower, alpha: false, powerPreference: 'low-power' });
  if (!context) throw new Error('Static court preview selected');
  const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: !lowPower, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#080e14');
  scene.fog = new THREE.FogExp2('#080e14', .023);
  const camera = new THREE.PerspectiveCamera(43, 1, .1, 130);
  scene.add(new THREE.HemisphereLight(0xc3dded, 0x17202a, 1.6));
  const key = new THREE.DirectionalLight(0xe3edff, 3.8);
  key.position.set(-7, 15, 9); key.castShadow = !lowPower;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -18, right: 18, top: 23, bottom: -23, far: 65 });
  key.shadow.normalBias = .035; scene.add(key);
  const rim = new THREE.DirectionalLight(0xb6d8c7, 2.5); rim.position.set(9, 9, -14); scene.add(rim);
  const court = createAuthenticCourt(0);
  court.traverse(n => { if (n.isMesh && n.material.color && n.material.map) n.material.color.set(n.name === 'courtSurround' ? '#31494b' : '#5f8393'); });
  scene.add(court, createAuthenticTennisNet(0));
  const metal = new THREE.MeshStandardMaterial({ color: '#192b32', metalness: .55, roughness: .4 });
  const luminous = new THREE.MeshBasicMaterial({ color: '#d9e9e4' });
  const dimLine = new THREE.LineBasicMaterial({ color: '#7b999b', transparent: true, opacity: .17 });
  function box(w, h, d, material, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); m.position.set(x, y, z); scene.add(m); return m; }
  // Dark, architectural stadium: visible depth without competing scenery.
  for (const side of [-1, 1]) {
    box(.18, 5, 37, metal, side * 11.4, 2.5, 0);
    for (let z = -18; z <= 18; z += 3) box(.07, 6, .07, metal, side * 11.2, 3, z);
    for (const z of [-14, 8]) {
      box(.12, 11, .12, metal, side * 9.8, 5.5, z);
      box(3.1, .14, .65, metal, side * 8.9, 11, z);
      for (let i = 0; i < 6; i++) box(.35, .06, .42, luminous, side * 8.9 + (i - 2.5) * .47, 10.91, z);
      const spot = new THREE.SpotLight(0xd6e4ee, 75, 32, .62, .7, 1.2);
      spot.position.set(side * 8.9, 10.8, z); spot.target.position.set(side * 2, 0, z + 1); scene.add(spot, spot.target);
      if (!lowPower) {
        const beam = new THREE.Mesh(new THREE.ConeGeometry(4.1, 11, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xc4d9dd, transparent: true, opacity: .013, side: THREE.DoubleSide, depthWrite: false }));
        beam.position.set(side * 8.9, 5.4, z); scene.add(beam);
      }
    }
    const led = box(.025, .018, 34, luminous, side * 9.3, .03, 0); led.material = new THREE.MeshBasicMaterial({ color: '#6d9288' });
  }
  box(23, 5, .15, metal, 0, 2.5, -18.5);
  // Fine stadium mesh on the far wall, merged into one line draw call.
  const fencePoints = [];
  for (let x = -11; x <= 11; x += .5) fencePoints.push(x, .1, -18.37, x, 5, -18.37);
  for (let y = .2; y <= 5; y += .4) fencePoints.push(-11, y, -18.37, 11, y, -18.37);
  const fenceGeometry = new THREE.BufferGeometry(); fenceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fencePoints, 3));
  scene.add(new THREE.LineSegments(fenceGeometry, dimLine));
  const lettering = document.createElement('canvas'); lettering.width = 2048; lettering.height = 256;
  const lc = lettering.getContext('2d'); lc.fillStyle = '#bac9ca'; lc.textAlign = 'center'; lc.font = '600 96px Arial'; lc.fillText('M A T C H P O I N T', 1024, 150);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(13, 1.625), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(lettering), transparent: true, opacity: .38, depthWrite: false }));
  sign.position.set(0, 3.7, -18.34); scene.add(sign);

  const ballGroup = new THREE.Group(); scene.add(ballGroup);
  const textureCanvas = document.createElement('canvas'); textureCanvas.width = 1024; textureCanvas.height = 512;
  const bc = textureCanvas.getContext('2d'); bc.fillStyle = '#ccd956'; bc.fillRect(0, 0, 1024, 512);
  let seed = 17; const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 40000; i++) { bc.fillStyle = random() > .5 ? '#ffffff16' : '#35471b16'; bc.fillRect(random() * 1024, random() * 512, 1.3, 1.3); }
  bc.strokeStyle = '#eef0d7'; bc.lineWidth = 8;
  for (const offset of [0, 512]) { bc.beginPath(); for (let x = 0; x <= 1024; x += 2) { const y = 256 + Math.sin((x + offset) / 1024 * Math.PI * 2) * 150; x ? bc.lineTo(x, y) : bc.moveTo(x, y); } bc.stroke(); }
  const ballTexture = new THREE.CanvasTexture(textureCanvas); ballTexture.colorSpace = THREE.SRGBColorSpace;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.23, 48, 32), new THREE.MeshStandardMaterial({ map: ballTexture, roughness: .93, bumpMap: ballTexture, bumpScale: .004 }));
  ball.castShadow = true; ballGroup.add(ball);
  const ballAura = new THREE.PointLight('#c7d975', 1.5, 2.5); ballGroup.add(ballAura);

  const equipment = new THREE.Group(); equipment.position.set(2, 2.3, 3); scene.add(equipment);
  const racket = new THREE.Group(); equipment.add(racket);
  // A procedural equipment fallback stays visible if the optional GLB cannot load.
  const fallbackFrame = new THREE.Mesh(new THREE.TorusGeometry(.63, .035, 10, 64), metal); fallbackFrame.scale.y = 1.32;
  const fallbackGrip = new THREE.Mesh(new THREE.CylinderGeometry(.055, .07, .8, 12), metal); fallbackGrip.position.y = -1.35;
  racket.add(fallbackFrame, fallbackGrip);
  new GLTFLoader().load('/pc/racket_new.glb', gltf => {
    finishPremiumRacket(gltf.scene);
    const bounds = new THREE.Box3().setFromObject(gltf.scene); const size = bounds.getSize(new THREE.Vector3());
    const scale = 3.8 / Math.max(size.x, size.y, size.z);
    gltf.scene.scale.setScalar(scale); gltf.scene.position.sub(bounds.getCenter(new THREE.Vector3()).multiplyScalar(scale));
    racket.remove(fallbackFrame, fallbackGrip); fallbackFrame.geometry.dispose(); fallbackGrip.geometry.dispose(); racket.add(gltf.scene);
  }, undefined, () => { host.dataset.equipment = 'simplified'; });
  const phone = new THREE.Group();
  const phoneBody = new THREE.Mesh(new THREE.BoxGeometry(.54, 1.05, .055), new THREE.MeshPhysicalMaterial({ color: '#121c24', metalness: .7, roughness: .25, clearcoat: 1 })); phone.add(phoneBody);
  const phoneScreen = new THREE.Mesh(new THREE.PlaneGeometry(.48, .91), new THREE.MeshBasicMaterial({ color: '#203c3e' })); phoneScreen.position.z = .03; phone.add(phoneScreen);
  const screenCanvas = document.createElement('canvas'); screenCanvas.width = 256; screenCanvas.height = 512;
  const pc = screenCanvas.getContext('2d'); pc.fillStyle = '#10252a'; pc.fillRect(0,0,256,512); pc.fillStyle = '#d7ed89'; pc.font = 'bold 23px Arial'; pc.fillText('MATCHPOINT',25,80); pc.strokeStyle = '#7dc3b2'; pc.lineWidth=2; pc.beginPath();
  for(let i=0;i<230;i++){const y=250+Math.sin(i*.065)*25*Math.sin(i*.014);i?pc.lineTo(i+13,y):pc.moveTo(i+13,y);} pc.stroke();pc.fillStyle='#99b7bb';pc.font='16px Arial';pc.fillText('MOTION CONNECTED',30,390);
  const screenMap = new THREE.CanvasTexture(screenCanvas); screenMap.colorSpace = THREE.SRGBColorSpace; phoneScreen.material.map=screenMap;
  phone.position.set(-1.3,-.1,.4); phone.rotation.y=.5; equipment.add(phone);
  const contact = new THREE.Group(); contact.position.set(2,2.5,3.4); scene.add(contact);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.43+i*.16,.004,4,90),new THREE.MeshBasicMaterial({color:0xd7ed89,transparent:true,opacity:.55-i*.12,depthWrite:false})); contact.add(ring);
  }
  const pathPoints = [new THREE.Vector3(2,2.5,3.5),new THREE.Vector3(1.2,4,-1),new THREE.Vector3(-2,2,-6),new THREE.Vector3(-2.6,.15,-9),new THREE.Vector3(-3,1.4,-12)];
  const curve = new THREE.CatmullRomCurve3(pathPoints);
  const path = new THREE.Group(); scene.add(path);
  const lineGeometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(180));
  const line = new THREE.Line(lineGeometry,new THREE.LineBasicMaterial({color:0xdbedb8,transparent:true,opacity:.8})); path.add(line);
  const pathTube = new THREE.Mesh(new THREE.TubeGeometry(curve,100,.032,6,false),new THREE.MeshBasicMaterial({color:0xd7ed89,transparent:true,opacity:.1,depthWrite:false}));path.add(pathTube);
  const bounceRing = new THREE.Mesh(new THREE.RingGeometry(.52,.55,64),new THREE.MeshBasicMaterial({color:0xd7ed89,side:THREE.DoubleSide,transparent:true,opacity:.7}));bounceRing.rotation.x=-Math.PI/2;bounceRing.position.set(-2.6,.04,-9);path.add(bounceRing);
  const cones = new THREE.Group(); scene.add(cones);
  for (const x of [-3,0,3]) for (let i = 0; i < 3; i++) {
    const c = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(.14,.48,16),new THREE.MeshStandardMaterial({color:0xe09454,roughness:.6})); cone.position.y=.25;cone.castShadow=true;c.add(cone);
    const base = new THREE.Mesh(new THREE.BoxGeometry(.35,.03,.35),metal);base.position.y=.03;c.add(base);c.position.set(x+(i-1)*.35,0,-9-(i%2)*.4);cones.add(c);
  }
  const spinOrbit = new THREE.Group();ballGroup.add(spinOrbit);
  for(let i=0;i<3;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(.36+i*.1,.0018,4,100,Math.PI*1.5),new THREE.MeshBasicMaterial({color:0xaed1c5,transparent:true,opacity:.65-i*.15}));ring.rotation.set(.5+i*.5,.6,i*.7);spinOrbit.add(ring);}
  const winds = new THREE.Group();scene.add(winds);
  for(let i=0;i<7;i++) {const pts=[];for(let j=0;j<=50;j++){const u=j/50;pts.push(new THREE.Vector3(-8+u*16,.9+i*.15+Math.sin(u*9+i)*.25,-5+i*.28+Math.sin(u*7+i)*.5));}const g=new THREE.BufferGeometry().setFromPoints(pts);winds.add(new THREE.Line(g,new THREE.LineBasicMaterial({color:0x91bfc9,transparent:true,opacity:.1,depthWrite:false})));}
  const dustPositions = new Float32Array((lowPower?70:180)*3);
  for(let i=0;i<dustPositions.length;i+=3){dustPositions[i]=(random()-.5)*23;dustPositions[i+1]=random()*8+.4;dustPositions[i+2]=(random()-.5)*34;}
  const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));const dust=new THREE.Points(dustGeo,new THREE.PointsMaterial({color:0xcedbdd,size:.018,transparent:true,opacity:.35,depthWrite:false}));scene.add(dust);

  const poses = [
    {eye:[17,11.5,23],look:[0,.5,0]},
    {eye:[5.9,3.4,9.3],look:[1.5,2.3,3]},
    {eye:[11,8,15],look:[0,1,-2]},
    {eye:[8,15,14],look:[0,.3,-5]},
    {eye:[3.6,2.8,6.7],look:[2,2.5,3.4]},
    {eye:[0,4.8,17],look:[0,1,-3]}
  ];
  const v=new THREE.Vector3(),look=new THREE.Vector3();
  let progress=0, targetProgress=0, paused=reduced, disposed=false, clock=0, raf=0, last=performance.now(), slowFrames=0;
  let feed='neutral',target='deep',quality=lowPower?'low':'high',flightProgress=.15,flightCount=0;
  const smooth=x=>x*x*(3-2*x);
  const band=(p,center,width=1)=>Math.max(0,1-Math.abs(p-center)/width);
  function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.setViewOffset(w,h,w>700?-w*.13:0,0,w,h);camera.updateProjectionMatrix();render(0);}
  function render(dt){
    if(disposed)return;
    if(!paused)clock+=dt;
    const p=paused?targetProgress:progress;
    const index=Math.min(4,Math.floor(p)),u=smooth(Math.min(1,p-index));
    camera.position.fromArray(poses[index].eye).lerp(v.fromArray(poses[index+1].eye),u);
    look.fromArray(poses[index].look).lerp(v.fromArray(poses[index+1].look),u);
    if(innerWidth<700){camera.position.y+=2;camera.position.z+=4;}
    camera.lookAt(look);
    equipment.visible=p>.45&&p<2.8;equipment.scale.setScalar(Math.max(.001,band(p,1,1.6)));
    racket.rotation.set(.08,-.4+(p-1)*.35,-.35);phone.position.x=-1.3-(p-1)*.3;
    const detail=band(p,4,.9);
    ballGroup.position.set(2,2.5+(paused?0:Math.sin(clock*.7)*.035),3.4);
    ballGroup.scale.setScalar(1+detail*2.1);
    ball.rotation.set(.25,clock*.15,clock*.045);spinOrbit.visible=detail>.05;spinOrbit.rotation.y=clock*.18;
    path.visible=p>1.4&&p<3.45;contact.visible=p>1.4&&p<2.8;contact.rotation.y=.1;
    if(path.visible){
      const activeFeed=feed==='random'?['neutral','flat','spin'][flightCount%3]:feed;
      if(!paused){flightProgress+=dt*(activeFeed==='flat'?.24:.13);if(flightProgress>=1){flightProgress%=1;flightCount++;}}
      curve.getPointAt(paused ? .45 : flightProgress,ballGroup.position);
      if(activeFeed==='spin')ball.rotation.x=clock*2;
      lineGeometry.setDrawRange(0,181);
    }
    cones.visible=p>2.25&&p<3.9;
    const depth=target==='short'?-2.8:target==='regular'?-6:-9;
    cones.children.forEach((c,i)=>{c.position.z=depth-(i%2)*.4+(target==='regular'?Math.sin(i*2)*2:0);});
    winds.visible=p>2.5&&p<3.8;winds.position.x=paused?0:Math.sin(clock*.3)*.7;winds.position.z=Math.sin(clock*.4)*.25;
    dust.rotation.y=clock*.006;
    renderer.render(scene,camera);
  }
  function tick(now){
    raf=0;if(disposed||document.hidden)return;
    const elapsed=Math.min(.1,(now-last)/1000);
    if(elapsed<(quality==='low'?1/30:1/60)-.001){raf=requestAnimationFrame(tick);return;}
    last=now;progress+= (targetProgress-progress)*(1-Math.exp(-elapsed*6));
    if(Math.abs(targetProgress-progress)<.0002)progress=targetProgress;
    render(elapsed);
    if(elapsed>.035&&quality==='high'&&++slowFrames>75){quality='low';renderer.setPixelRatio(1);renderer.shadowMap.enabled=false;host.dataset.quality='adaptive';}
    if(!paused||Math.abs(targetProgress-progress)>.0002)raf=requestAnimationFrame(tick);
  }
  const wake=()=>{if(!raf&&!disposed&&!document.hidden){last=performance.now();raf=requestAnimationFrame(tick);}};
  function visibility(){if(document.hidden){cancelAnimationFrame(raf);raf=0;}else wake();}
  function contextLost(e){e.preventDefault();document.body.classList.remove('scene-ready');document.body.classList.add('scene-fallback');cancelAnimationFrame(raf);raf=0;}
  renderer.domElement.addEventListener('webglcontextlost',contextLost);
  renderer.domElement.addEventListener('webglcontextrestored',()=>{document.body.classList.add('scene-ready');document.body.classList.remove('scene-fallback');wake();});
  window.addEventListener('resize',resize);document.addEventListener('visibilitychange',visibility);
  resize();render(0);document.body.classList.add('scene-ready');host.dataset.ready='true';wake();
  return {
    setProgress(value){targetProgress=Math.max(0,Math.min(5,value));if(paused){progress=targetProgress;render(0);}else wake();},
    setPaused(value){paused=value;if(value){progress=targetProgress;cancelAnimationFrame(raf);raf=0;render(0);}else wake();},
    setFeed(value){feed=value;render(0);},setTarget(value){target=value;render(0);},
    dispose(){disposed=true;cancelAnimationFrame(raf);window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);const materials=new Set(),geometries=new Set(),textures=new Set();scene.traverse(n=>{if(n.geometry)geometries.add(n.geometry);if(n.material)(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>materials.add(m));});materials.forEach(m=>{Object.values(m).forEach(v=>{if(v?.isTexture)textures.add(v);});m.dispose();});textures.forEach(t=>t.dispose());geometries.forEach(g=>g.dispose());renderer.dispose();}
  };
}
