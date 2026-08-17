import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  configureAuthenticRenderer, createAuthenticCourt, createAuthenticTennisNet, createCourtBackdrop, createFeedOriginMarker,
  TENNIS_COURT
} from "../client-pc/src/scene/tennisEnvironment.js";

test("authentic court creates regulation markings and shadow receiving surfaces", () => {
  const court = createAuthenticCourt(-5.5);
  assert.equal(court.name, "authenticTennisCourt");
  for (const name of [
    "playingSurface", "nearBaseline", "farBaseline", "singlesSidelineLeft", "singlesSidelineRight",
    "doublesSidelineLeft", "doublesSidelineRight", "nearServiceLine", "farServiceLine",
    "centerServiceLine", "nearCenterMark", "farCenterMark"
  ]) assert.ok(court.getObjectByName(name), `${name} should exist`);
  assert.equal((court.getObjectByName("playingSurface") as THREE.Mesh).receiveShadow, true);
  const surfaceMaterial = (court.getObjectByName("playingSurface") as THREE.Mesh).material as THREE.MeshStandardMaterial;
  assert.ok(surfaceMaterial.map, "playing surface should have procedural color detail");
  assert.ok(surfaceMaterial.roughnessMap, "playing surface should have roughness variation");
  assert.ok(court.getObjectByName("nearLeftServiceBoxTone"));
  assert.ok(court.getObjectByName("courtDrainLeft"));
  assert.equal(TENNIS_COURT.length, 23.77);
  assert.equal(TENNIS_COURT.singlesWidth, 8.23);
});

test("tennis net includes mesh, white band, and two shadow-casting posts", () => {
  const net = createAuthenticTennisNet(-5.5);
  assert.equal(net.name, "authenticTennisNet");
  assert.ok(net.getObjectByName("netMesh"));
  assert.ok(net.getObjectByName("netTopBand"));
  assert.ok(net.getObjectByName("netCenterStrap"));
  assert.ok(net.getObjectByName("netBottomTape"));
  assert.equal((net.getObjectByName("netPostLeft") as THREE.Mesh).castShadow, true);
  assert.equal((net.getObjectByName("netPostRight") as THREE.Mesh).castShadow, true);
  assert.equal(TENNIS_COURT.netCenterHeight, 0.914);

  const positions = (net.getObjectByName("netTopBand") as THREE.Mesh).geometry.getAttribute("position");
  const centerTop = positions.getY(Math.floor((positions.count - 1) / 4) * 2);
  const edgeTop = positions.getY(0);
  assert.ok(edgeTop > centerTop, "top band should sag toward regulation center height");
});

test("court backdrop adds restrained windscreens and depth structure", () => {
  const backdrop = createCourtBackdrop(-5.5);
  assert.ok(backdrop.getObjectByName("farWindscreen"));
  assert.ok(backdrop.getObjectByName("sideWindscreenLeft"));
  assert.ok(backdrop.getObjectByName("sideWindscreenRight"));
  assert.ok(backdrop.getObjectByName("farSeatingTier1"));
});

test("renderer configuration enables soft shadows and color-managed tone mapping", () => {
  const renderer = {
    shadowMap: { enabled: false, type: 0 }, outputColorSpace: "", toneMapping: 0, toneMappingExposure: 0
  } as unknown as THREE.WebGLRenderer;
  configureAuthenticRenderer(renderer);
  assert.equal(renderer.shadowMap.enabled, true);
  assert.equal(renderer.shadowMap.type, THREE.PCFSoftShadowMap);
  assert.equal(renderer.outputColorSpace, THREE.SRGBColorSpace);
  assert.equal(renderer.toneMapping, THREE.ACESFilmicToneMapping);
});

test("feed origin marker provides a compact ground ring and vertical beacon", () => {
  const marker = createFeedOriginMarker();
  assert.equal(marker.name, "feedOriginMarker");
  assert.ok(marker.getObjectByName("feedOriginRing"));
  assert.ok(marker.getObjectByName("feedOriginBeacon"));
  assert.ok(marker.getObjectByName("feedOriginCap"));
});
