// Original staged film: uses the application court and racket, never player data.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createAuthenticCourt, createAuthenticTennisNet, createCourtBackdrop, configureAuthenticRenderer } from '../assets/scene/tennisEnvironment.js';
import { addPremiumEnvironment, finishPremiumRacket } from '../assets/scene/premiumVisuals.js';
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(1600, 900); renderer.setPixelRatio(1); configureAuthenticRenderer(renderer);
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#7f9eab');
const camera = new THREE.PerspectiveCamera(48, 16 / 9, .1, 150);
scene.add(new THREE.HemisphereLight(0xd9eaff, 0x3e5035, 2));
const sun = new THREE.DirectionalLight(0xffe5b9, 2.5); sun.position.set(-8, 16, 4); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera,{left:-18,right:18,top:20,bottom:-20,far:65}); sun.shadow.normalBias=.03; scene.add(sun);
scene.add(createAuthenticCourt(-5.5), createAuthenticTennisNet(-5.5), createCourtBackdrop(-5.5));
const environment=addPremiumEnvironment(scene, renderer);
environment.getObjectByName('premiumSky').scale.x=1.6;
const ball = new THREE.Mesh(new THREE.SphereGeometry(.16,24,16),new THREE.MeshStandardMaterial({color:0xdbed45,roughness:.8}));ball.castShadow=true;scene.add(ball);
const ring = new THREE.Mesh(new THREE.RingGeometry(.2,.23,48),new THREE.MeshBasicMaterial({color:0xe6f98b,transparent:true,opacity:.5,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.03;scene.add(ring);
const trailGeometry = new THREE.BufferGeometry();const trailPositions = new Float32Array(36*3);trailGeometry.setAttribute('position',new THREE.BufferAttribute(trailPositions,3));
const trail = new THREE.Line(trailGeometry,new THREE.LineBasicMaterial({color:0xecffd0,transparent:true,opacity:.22}));trail.frustumCulled=false;scene.add(trail);
const racket = new THREE.Group();scene.add(racket);
try {const gltf=await new GLTFLoader().loadAsync('/pc/racket_new.glb');finishPremiumRacket(gltf.scene);const box=new THREE.Box3().setFromObject(gltf.scene);const size=box.getSize(new THREE.Vector3());const scale=2.3/Math.max(size.x,size.y,size.z);gltf.scene.scale.setScalar(scale);const center=box.getCenter(new THREE.Vector3()).multiplyScalar(scale);gltf.scene.position.sub(center);racket.add(gltf.scene);} catch(error){console.error(error);}
const points = [new THREE.Vector3(-2,1.6,-15),new THREE.Vector3(1.7,.17,-2.3),new THREE.Vector3(2.3,1.3,2.2),new THREE.Vector3(-2.7,.17,-13),new THREE.Vector3(-2.9,1.2,-15)];
function ballAt(t){const phase=(t%6+6)%6;let a,b,u,arc;if(phase<1.9){a=points[0];b=points[1];u=phase/1.9;arc=1.0;}else if(phase<2.6){a=points[1];b=points[2];u=(phase-1.9)/.7;arc=.28;}else if(phase<5.15){a=points[2];b=points[3];u=(phase-2.6)/2.55;arc=2.45;}else{a=points[3];b=points[4];u=(phase-5.15)/.85;arc=.5;}return new THREE.Vector3().lerpVectors(a,b,u).add(new THREE.Vector3(0,Math.sin(u*Math.PI)*arc,0));}
window.renderFilmFrame = t => {
  const orbit = t/18*Math.PI*2;
  camera.position.set(2.1+Math.sin(orbit)*2.3,5.3+Math.sin(orbit)*.35,12.7+Math.cos(orbit)*.4);camera.lookAt(.3,1,-5.0);
  ball.position.copy(ballAt(t));ring.position.x=ball.position.x;ring.position.z=ball.position.z;ring.scale.setScalar(.7+ball.position.y*.18);
  for(let i=0;i<36;i++) ballAt(t-i*.012).toArray(trailPositions,i*3);trailGeometry.attributes.position.needsUpdate=true;
  const strike=Math.exp(-Math.pow(((t%6)-2.6)*6,2));racket.position.set(2.3-strike*.5,1.25,2.4);racket.rotation.set(-.1,.15+strike*1.9,-.35+strike*.8);
  renderer.render(scene,camera);
};
await new Promise(resolve=>setTimeout(resolve,2000));window.renderFilmFrame(0);window.filmReady=true;
