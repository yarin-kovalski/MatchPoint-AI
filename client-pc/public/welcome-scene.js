// Welcome-only scene. No sockets, sensors, gameplay state or shot simulation.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createAuthenticCourt, createAuthenticTennisNet } from './assets/scene/tennisEnvironment.js';
import { createFeltBall, createResortWorld, refineWelcomeRacket, createPracticeCone } from './welcome-materials.js';
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
  renderer.toneMappingExposure = .92;
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(43, 1, .1, 300);
  const resort = createResortWorld(scene,renderer,lowPower);
  const court = createAuthenticCourt(0);
  court.traverse(n => { if (n.isMesh && n.material.color && n.material.map) n.material.color.set(n.name === 'courtSurround' ? '#536d5a' : '#7894a3'); });
  const finished=new Set();
  court.traverse(n=>{if(n.isMesh && n.material.map && !finished.has(n.material)){finished.add(n.material);n.material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb=mix(vec3(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))),diffuseColor.rgb,.55);');};n.material.needsUpdate=true;}});
  scene.add(court, createAuthenticTennisNet(0));
  const metal = new THREE.MeshStandardMaterial({ color: '#192b32', metalness: .55, roughness: .4 });
  const ballGroup = new THREE.Group(); scene.add(ballGroup);
  const ball = createFeltBall(lowPower); ballGroup.add(ball);
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64;const shadowContext=shadowCanvas.getContext('2d');
  const shadowGradient=shadowContext.createRadialGradient(32,32,0,32,32,32);shadowGradient.addColorStop(0,'#142a2566');shadowGradient.addColorStop(1,'#142a2500');shadowContext.fillStyle=shadowGradient;shadowContext.fillRect(0,0,64,64);
  const contactShadow=new THREE.Mesh(new THREE.PlaneGeometry(1.2,1.2),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false,opacity:.4}));contactShadow.rotation.x=-Math.PI/2;contactShadow.position.y=.024;scene.add(contactShadow);
  const equipment = new THREE.Group(); equipment.position.set(2, 2.3, 3); scene.add(equipment);
  const racket = new THREE.Group(); equipment.add(racket);
  // A procedural equipment fallback stays visible if the optional GLB cannot load.
  const fallbackFrame = new THREE.Mesh(new THREE.TorusGeometry(.63, .035, 10, 64), metal); fallbackFrame.scale.y = 1.32;
  const fallbackGrip = new THREE.Mesh(new THREE.CylinderGeometry(.055, .07, .8, 12), metal); fallbackGrip.position.y = -1.35;
  racket.add(fallbackFrame, fallbackGrip);
  new GLTFLoader().load('/pc/racket_new.glb', gltf => {
    finishPremiumRacket(gltf.scene); refineWelcomeRacket(gltf.scene);
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
  const screenMap = new THREE.CanvasTexture(screenCanvas); screenMap.colorSpace = THREE.SRGBColorSpace; phoneScreen.material.map=screenMap;phoneScreen.material.color.set(0xffffff);
  phone.position.set(-1.3,-.1,.4); phone.rotation.y=.5; equipment.add(phone);
  // One measured-looking flight arc: contact, apex, first bounce.
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(2,2.5,3.5),
    new THREE.Vector3(.2,4.7,-2.5),
    new THREE.Vector3(-2.65,.15,-9.2)
  );
  const path = new THREE.Group(); scene.add(path);
  const lineGeometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(180));
  const line = new THREE.Line(lineGeometry,new THREE.LineBasicMaterial({color:0xdbedb8,transparent:true,opacity:.8})); path.add(line);
  const cones = new THREE.Group(); scene.add(cones);
  for (const x of [-3,0,3]) for (let i = 0; i < 3; i++) {
    const c = createPracticeCone(); c.position.set(x+(i-1)*.35,0,-9-(i%2)*.4);cones.add(c);
  }
  const winds = new THREE.Group();scene.add(winds);
  for(let i=0;i<3;i++) {const pts=[];for(let j=0;j<=50;j++){const u=j/50;pts.push(new THREE.Vector3(-8+u*16,1+i*.28+Math.sin(u*7+i)*.16,-4.7+i*.5+Math.sin(u*5+i)*.28));}const g=new THREE.BufferGeometry().setFromPoints(pts);winds.add(new THREE.Line(g,new THREE.LineBasicMaterial({color:0xb5d6d7,transparent:true,opacity:.085,depthWrite:false})));}
  const poses = [
    {eye:[13.5,4.4,24],look:[0,1.15,-2.5]},
    {eye:[5.2,2.65,8.7],look:[1.55,2.25,3]},
    {eye:[10.8,4.4,14.8],look:[-.4,1.2,-3.2]},
    {eye:[-8.8,4.15,10.5],look:[0,.85,-5.8]},
    {eye:[3.55,2.6,6.85],look:[2,2.5,3.4]},
    {eye:[-5.8,3.35,14.5],look:[0,.85,-3.5]}
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
    if(innerWidth<700){camera.position.y+=.8;camera.position.z+=3;}
    camera.lookAt(look);
    const equipmentReveal=smooth(THREE.MathUtils.clamp((p-.32)/.45,0,1))*(1-smooth(THREE.MathUtils.clamp((p-1.7)/.8,0,1)));
    equipment.visible=equipmentReveal>.001;equipment.scale.setScalar(Math.max(.001,equipmentReveal));
    racket.rotation.set(.08,-.4+(p-1)*.35,-.35);phone.position.x=-1.3-(p-1)*.3;
    const detail=band(p,4,.9);
    ballGroup.position.set(2,2.5+(paused?0:Math.sin(clock*.7)*.035),3.4);
    ballGroup.scale.setScalar(1+detail*2.1);
    ball.rotation.set(.4,clock*.09+.6,1.1);ball.userData.fuzz.visible=detail>.1;resort.update(clock);
    const pathReveal=smooth(THREE.MathUtils.clamp((p-1.55)/.35,0,1))*(1-smooth(THREE.MathUtils.clamp((p-2.4)/.35,0,1)));
    path.visible=pathReveal>.001;line.material.opacity=.65*pathReveal;
    if(path.visible){
      const activeFeed=feed==='random'?['neutral','flat','spin'][flightCount%3]:feed;
      if(!paused){flightProgress+=dt*(activeFeed==='flat'?.24:.13);if(flightProgress>=1){flightProgress%=1;flightCount++;}}
      curve.getPointAt(paused ? .45 : flightProgress,ballGroup.position);
      if(activeFeed==='spin')ball.rotation.x=clock*2;
      lineGeometry.setDrawRange(0,Math.max(2,Math.round(181*pathReveal)));
    }
    cones.visible=p>2.72&&p<3.62;
    const depth=target==='short'?-2.8:target==='regular'?-6:-9;
    cones.children.forEach((c,i)=>{c.position.z=depth-(i%2)*.4+(target==='regular'?Math.sin(i*2)*2:0);});
    winds.visible=p>2.85&&p<3.55;winds.position.x=paused?0:Math.sin(clock*.3)*.7;winds.position.z=Math.sin(clock*.4)*.25;

    contactShadow.position.x=ballGroup.position.x;contactShadow.position.z=ballGroup.position.z;contactShadow.scale.setScalar(1+detail*1.5);
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
    dispose(){disposed=true;cancelAnimationFrame(raf);window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);const materials=new Set(),geometries=new Set(),textures=new Set();scene.traverse(n=>{if(n.geometry)geometries.add(n.geometry);if(n.material)(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>materials.add(m));});materials.forEach(m=>{Object.values(m).forEach(v=>{if(v?.isTexture)textures.add(v);});m.dispose();});textures.forEach(t=>t.dispose());geometries.forEach(g=>g.dispose());resort.dispose();renderer.dispose();}
  };
}
