import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { readFileSync } from "node:fs";
import { SensorNormalizer } from "../client-pc/src/motion/sensorNormalization.js";
import { adaptiveVisualSmoothingFactor, SensorResampler, updateVisualRacketQuaternion } from "../client-pc/src/motion/sensorResampler.js";
import { FrameTelemetry } from "../client-pc/src/diagnostics/frameTelemetry.js";
import { BallController } from "../client-pc/src/ball/BallController.js";
import { advanceBallFixedStep, sampleBallVisualPosition } from "../client-pc/src/ball/fixedStepBallPhysics.js";
import { integrateBallRotation } from "../client-pc/src/ball/ballVisuals.js";
import { createArchetypeFeed, FEED_ARCHETYPES, FeedArchetype, resolveFeedStyle } from "../client-pc/src/ball/feedArchetypes.js";
import { generateSafeFeedVariation } from "../client-pc/src/ball/feedVariation.js";
import { positionValidatedProfileAtBaseline } from "../client-pc/src/ball/courtPositioning.js";
import { solveTrajectoryProfile } from "../client-pc/src/ball/trajectoryCalibration.js";
import { sampleSpinFlight, solveSpinFlight } from "../client-pc/src/ball/spinFlight.js";
import { BALL_CONFIG } from "../client-pc/src/ball/ballConfig.js";
import { StrokeDetectorSnapshot } from "../client-pc/src/strokeDetection/strokeTypes.js";
import { validateVariation, validatedForehandBase, validatedBackhandBase } from "../client-pc/src/ball/feedVariation.js";
import { createAuthenticTennisNet } from "../client-pc/src/scene/tennisEnvironment.js";
import { addPremiumEnvironment, courtPixelRatio, createMicroTexture, createSkyDome, createSoftContactShadowTexture, finishPremiumRacket, impactSquashScale, updatePremiumEnvironment } from "../client-pc/src/scene/premiumVisuals.js";

test("a rejected orientation spike cannot latch the racket on an old pose", () => {
  const normalizer = new SensorNormalizer();
  const input = (timestamp: number, angle: number) => ({ timestamp, sensorTimestamp: timestamp / 1000,
    currentPhoneQuaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), angle),
    relativePhoneQuaternion: new THREE.Quaternion(), mappedRacketQuaternion: new THREE.Quaternion(),
    accelerationMps2: new THREE.Vector3(), accelerationIncludingGravityMps2: new THREE.Vector3() });
  assert.ok(normalizer.process(input(1000, 0)).valid);
  assert.equal(normalizer.process(input(1016, 1.2)).rejectionReason, "impossible rotation spike");
  assert.ok(normalizer.process(input(1032, 1.21)).valid, "subsequent coherent samples recover without recalibration");
});

test("visual smoothing has equal response at 30, 60 and 120 Hz", () => {
  const end: THREE.Quaternion[] = [];
  for (const hz of [30,60,120]) {
    const q = new THREE.Quaternion(), target = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), 0.3);
    for (let i=0;i<hz/2;i++) updateVisualRacketQuaternion(q,target,adaptiveVisualSmoothingFactor(0,0,0,true,1/hz),1/hz);
    end.push(q);
  }
  assert.ok(end[0].angleTo(end[2]) < 1e-6);
});

test("late orientation recovery has a bounded per-frame visual change", () => {
  const q=new THREE.Quaternion(), target=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI);
  updateVisualRacketQuaternion(q,target,1,1/60);
  assert.ok(q.angleTo(new THREE.Quaternion()) <= 0.500001);
});

test("invalid angular velocity cannot contaminate sensor prediction", () => {
  const r=new SensorResampler();
  assert.equal(r.add({timestamp:1,quaternion:new THREE.Quaternion(),angularVelocity:new THREE.Vector3(NaN,0,0),angularSpeed:0,accelerationMagnitude:0,jerk:0}),false);
  assert.equal(r.sample(2),null);
});

test("render interpolation stays continuous between fixed steps without mutating physics", () => {
  const c=new BallController();c.launch("easyForehand","right","normal",0);
  c.ball.position.set(0,5,0); c.ball.velocity.set(5,0,0);
  c.physicsState.previousStepPosition.copy(c.ball.position);
  const visual=new THREE.Vector3(), previous=c.ball.position.clone();
  for(let i=0;i<60;i++) {
    advanceBallFixedStep(c.ball,1/240,c.physicsState);
    const physics=c.ball.position.clone();
    sampleBallVisualPosition(c.ball,c.physicsState,visual);
    assert.ok(visual.distanceTo(previous)<0.035);
    assert.deepEqual(c.ball.position,physics);
    previous.copy(visual);
  }
});

test("ball rotation integrates world-space spin even after a differently oriented impact", () => {
  const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),1);
  const original=q.clone(); const spin=new THREE.Vector3(-20,0,0);
  integrateBallRotation(q,spin,0.01);
  const expected=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-.2).multiply(original);
  assert.ok(q.angleTo(expected)<1e-6);
});

test("rolling telemetry measures long frames and ages them out", () => {
  const t=new FrameTelemetry(100);
  for(let i=0;i<94;i++)t.record(16);
  for(let i=0;i<6;i++)t.record(50);
  assert.equal(t.snapshot().p95FrameMs,50);
  assert.equal(t.snapshot().longFrames,6);
  for(let i=0;i<100;i++)t.record(10);
  assert.equal(t.snapshot().fps,100);
  assert.equal(t.snapshot().longFrames,0);
});

test("court resolution has a fixed pixel budget even on large high-DPI displays", () => {
  for (const [width,height,dpr] of [[1037,900,1],[3840,2160,2],[600,400,3]]) {
    const ratio=courtPixelRatio(width,height,dpr);
    assert.ok(width*height*ratio*ratio <= 700001);
    assert.ok(ratio <= dpr && ratio <= 1.5);
  }
});

for(const side of ["forehand","backhand"] as const) for(const kind of Object.keys(FEED_ARCHETYPES) as FeedArchetype[]) {
  test(`${side} ${kind}: deterministic feed clears net and remains in contact envelope`,()=>{
    const base=generateSafeFeedVariation(side,"low",1234), before=JSON.stringify(base);
    const feed=createArchetypeFeed(base,kind), again=createArchetypeFeed(base,kind);
    assert.equal(feed.variation.fallback,false,feed.variation.validationErrors.join(';'));
    assert.equal(JSON.stringify(base),before);
    assert.deepEqual(feed.variation,again.variation);
    assert.deepEqual(feed.variation.profile.launchPointWorld,base.profile.launchPointWorld);
    assert.deepEqual(feed.variation.profile.bouncePointWorld,base.profile.bouncePointWorld);
    assert.deepEqual(feed.variation.profile.contactPointWorld,base.profile.contactPointWorld);
    assert.equal(feed.variation.profile.bounceToContactMs,base.profile.bounceToContactMs);
    const profile=positionValidatedProfileAtBaseline(feed.variation.profile);
    const solved=solveTrajectoryProfile(profile);
    assert.ok(solved.valid);
    const bounce=new THREE.Vector3().fromArray(profile.bouncePointWorld), target=new THREE.Vector3().fromArray(profile.contactPointWorld);
    const outgoing=solveSpinFlight(bounce,target,profile.bounceToContactMs/1000,feed.spin);
    assert.ok(sampleSpinFlight(bounce,outgoing,profile.bounceToContactMs/1000,feed.spin).distanceTo(target)<.005);
    let minimumHeight=Infinity, apex=0;
    for(let t=.01;t<profile.bounceToContactMs/1000;t+=.01){
      const point=sampleSpinFlight(bounce,outgoing,t,feed.spin); minimumHeight=Math.min(minimumHeight,point.y);apex=Math.max(apex,point.y);
    }
    assert.ok(minimumHeight > BALL_CONFIG.courtHeight+BALL_CONFIG.scale.physicalRadiusMeters);
    assert.ok(apex > target.y);
    assert.deepEqual(profile.contactPointWorld,positionValidatedProfileAtBaseline(base.profile).contactPointWorld);
  });
}

test("feed menu keeps three safe styles and Random never repeats the previous style",()=>{
  assert.deepEqual(Object.keys(FEED_ARCHETYPES),["neutral","fastFlat","heavyTopspin"]);
  assert.equal(resolveFeedStyle("neutral","fastFlat",()=>.5),"neutral");
  const next=resolveFeedStyle("random","neutral",()=>0);
  assert.notEqual(next,"neutral");
  assert.ok(next in FEED_ARCHETYPES);
});

test("Fast Flat changes pace and Heavy Topspin changes spin without moving contact",()=>{
  const base=generateSafeFeedVariation("forehand","off",1);
  const neutral=createArchetypeFeed(base,"neutral");
  const fast=createArchetypeFeed(base,"fastFlat");
  const spin=createArchetypeFeed(base,"heavyTopspin");
  assert.ok(fast.launchVelocity.length()>neutral.launchVelocity.length());
  assert.equal(neutral.spin.length(),0);
  assert.ok(spin.spin.x>neutral.spin.x);
  assert.deepEqual(fast.variation.profile.contactPointWorld,base.profile.contactPointWorld);
  assert.deepEqual(spin.variation.profile.contactPointWorld,base.profile.contactPointWorld);
});

test("premium net has physical cords in one mesh and reusable scene finishes",()=>{
  const net=createAuthenticTennisNet(-5.5);
  const mesh=net.getObjectByName('netMesh') as THREE.Mesh;
  assert.ok(mesh.isMesh);
  assert.ok(mesh.geometry.getAttribute('normal'));
  assert.ok(mesh.geometry.getAttribute('position').count<60000);
  assert.ok(createSkyDome().name==='premiumSky');
  const shadow=createSoftContactShadowTexture();
  assert.ok(shadow.image.data?.[3]===0);
  assert.ok(createMicroTexture().generateMipmaps);
  const model=new THREE.Group(), frame=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());
  (frame.material as THREE.Material).name='Mat.2';model.add(frame);
  const geometry=frame.geometry, matrix=frame.matrix.clone();finishPremiumRacket(model);
  assert.equal(frame.geometry,geometry);assert.deepEqual(frame.matrix,matrix);
  assert.equal((frame.material as THREE.Material).name,'premiumCompositeFrame');
  assert.deepEqual(impactSquashScale(30,.2,new THREE.Vector3()).toArray(),[1,1,1]);
});

test("outdoor environment contains sun, moving clouds and animated birds",()=>{
  const scene = new THREE.Scene();
  const environment = addPremiumEnvironment(scene, {} as THREE.WebGLRenderer);
  assert.equal(environment.name, "outdoorEnvironment");
  assert.ok(environment.getObjectByName("daylightSun"));
  assert.equal(environment.getObjectByName("movingClouds")?.children.length, 4);
  assert.equal(environment.getObjectByName("flyingBirds")?.children.length, 5);
  const clouds = environment.getObjectByName("movingClouds") as THREE.Group;
  const birds = environment.getObjectByName("flyingBirds") as THREE.Group;
  const cloudBefore = clouds.children[0].position.x;
  const birdBefore = birds.position.x;
  updatePremiumEnvironment(environment, 5);
  assert.notEqual(clouds.children[0].position.x, cloudBefore);
  assert.notEqual(birds.position.x, birdBefore);
});

test("Player Mode keeps debug geometry behind the Advanced visibility gate",()=>{
  const main=readFileSync('client-pc/src/main.ts','utf8');
  assert.match(main,/const advanced = elements.developerPanel.open/);
  assert.match(main,/if \(!advanced\)/);
  assert.match(main,/developerPanel.addEventListener\("toggle", updateBallHelperVisibility\)/);
  assert.match(main,/const show = elements.developerPanel.open/);
});

test("all six styles reach both contact anchors through live fixed-step physics without position jumps", () => {
  const idle = { currentState: "READY", lockedStrokeType: "unknown", scores: {} } as StrokeDetectorSnapshot;
  const absentRacket = new THREE.Matrix4().makeTranslation(100,100,100);
  for (const side of ["forehand", "backhand"] as const) {
    for (const kind of Object.keys(FEED_ARCHETYPES) as FeedArchetype[]) {
      for (const level of ["low", "medium"] as const) for (const seed of [1, 37, 1234, 99999]) {
        const feed = createArchetypeFeed(generateSafeFeedVariation(side, level, seed), kind);
        const context = `${side}/${kind}/${level}/${seed}`;
        assert.equal(feed.variation.fallback, false, context + feed.variation.validationErrors);
        assert.deepEqual(validateVariation(feed.variation.profile, side === "forehand" ? validatedForehandBase : validatedBackhandBase), [], context);
        const profile = positionValidatedProfileAtBaseline(feed.variation.profile);
        const controller = new BallController();
        controller.launch(side === "forehand" ? "guaranteedForehand" : "guaranteedBackhand", "right", "normal", 0, "one-handed", undefined, profile);
        controller.ball.velocity.copy(feed.launchVelocity);
        controller.ball.spinVector.copy(feed.spin);
        controller.ball.angularVelocity.copy(feed.spin);
        controller.ball.spinType = feed.spin.x > 0 ? "topspin" : "flat";
        let reached = false, crossed = false;
        for (let tick = 1; tick < 780; tick++) {
          const previous = controller.ball.position.clone();
          const speed = controller.ball.velocity.length();
          const now = tick * 1000 / 120;
          controller.update(1/120, now, absentRacket, idle, null, "easy", null, false);
          const point = controller.ball.position;
          assert.ok(point.distanceTo(previous) <= (speed + 1) / 120 + .001, context + " position jump");
          if (previous.z < BALL_CONFIG.launch.netDepth && point.z >= BALL_CONFIG.launch.netDepth && !crossed) {
            const t = (BALL_CONFIG.launch.netDepth - previous.z) / (point.z - previous.z);
            assert.ok(THREE.MathUtils.lerp(previous.y,point.y,t) > BALL_CONFIG.launch.netHeight + controller.ball.physicsRadius + .08, context + " net");
            crossed = true;
          }
          if (controller.ball.bounceCount === 1 && now >= controller.ball.contactDeadline) {
            assert.ok(point.distanceTo(controller.ball.contactTarget) < .15, context + ` missed anchor ${point.distanceTo(controller.ball.contactTarget)}`);
            assert.ok(controller.ball.velocity.y > -8 && controller.ball.velocity.z > 0, context + " incoming path");
            reached = true; break;
          }
          assert.ok(controller.ball.active && controller.ball.bounceCount < 2, context + " premature end");
        }
        assert.ok(reached && crossed, context);
      }
    }
  }
});
