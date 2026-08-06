import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  configureAuthenticRenderer, createAuthenticCourt, createAuthenticTennisNet, TENNIS_COURT
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
  assert.equal(TENNIS_COURT.length, 23.77);
  assert.equal(TENNIS_COURT.singlesWidth, 8.23);
});

test("tennis net includes mesh, white band, and two shadow-casting posts", () => {
  const net = createAuthenticTennisNet(-5.5);
  assert.equal(net.name, "authenticTennisNet");
  assert.ok(net.getObjectByName("netMesh"));
  assert.ok(net.getObjectByName("netTopBand"));
  assert.equal((net.getObjectByName("netPostLeft") as THREE.Mesh).castShadow, true);
  assert.equal((net.getObjectByName("netPostRight") as THREE.Mesh).castShadow, true);
  assert.equal(TENNIS_COURT.netCenterHeight, 0.914);
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
