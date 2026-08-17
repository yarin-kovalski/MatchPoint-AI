import * as THREE from "three";

export const TENNIS_COURT = {
  length: 23.77,
  doublesWidth: 10.97,
  singlesWidth: 8.23,
  serviceLineDistance: 6.40,
  centerMarkLength: 0.10,
  lineWidth: 0.05,
  netPostHeight: 1.07,
  netCenterHeight: 0.914,
  netWidth: 12.80
} as const;

const COURT_LEVEL = 0.006;
const LINE_LEVEL = 0.019;
const SURROUND_WIDTH = 21;
const SURROUND_LENGTH = 36;

interface SurfaceTextures {
  color: THREE.DataTexture;
  roughness: THREE.DataTexture;
}

const surfaceTextureCache = new Map<string, SurfaceTextures>();

export function configureAuthenticRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
}

export function createAuthenticCourt(netDepth: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "authenticTennisCourt";

  const surroundMaps = getSurfaceTextures("surround", [38, 86, 76], 18);
  const surround = new THREE.Mesh(
    new THREE.PlaneGeometry(SURROUND_WIDTH, SURROUND_LENGTH),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: surroundMaps.color,
      roughness: 0.92,
      roughnessMap: surroundMaps.roughness,
      bumpMap: surroundMaps.roughness,
      bumpScale: 0.012,
      metalness: 0
    })
  );
  surround.name = "courtSurround";
  surround.rotation.x = -Math.PI / 2;
  surround.position.set(0, 0, netDepth);
  surround.receiveShadow = true;
  group.add(surround);

  const courtMaps = getSurfaceTextures("playing", [39, 126, 112], 12);
  const surfaceMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: courtMaps.color,
    roughness: 0.84,
    roughnessMap: courtMaps.roughness,
    bumpMap: courtMaps.roughness,
    bumpScale: 0.008,
    metalness: 0
  });
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(TENNIS_COURT.doublesWidth, TENNIS_COURT.length),
    surfaceMaterial
  );
  surface.name = "playingSurface";
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(0, COURT_LEVEL, netDepth);
  surface.receiveShadow = true;
  group.add(surface);

  addServiceBoxTone(group, netDepth, surfaceMaterial);

  const lineMaterial = new THREE.MeshStandardMaterial({
    color: 0xf8f5e8,
    roughness: 0.62,
    metalness: 0
  });
  const halfLength = TENNIS_COURT.length / 2;
  const doublesHalf = TENNIS_COURT.doublesWidth / 2;
  const singlesHalf = TENNIS_COURT.singlesWidth / 2;
  const addLine = (name: string, width: number, depth: number, x: number, z: number): void => {
    const line = new THREE.Mesh(new THREE.BoxGeometry(width, 0.018, depth), lineMaterial);
    line.name = name;
    line.position.set(x, LINE_LEVEL, z);
    line.receiveShadow = true;
    group.add(line);
  };
  addLine("doublesSidelineLeft", TENNIS_COURT.lineWidth, TENNIS_COURT.length, -doublesHalf, netDepth);
  addLine("doublesSidelineRight", TENNIS_COURT.lineWidth, TENNIS_COURT.length, doublesHalf, netDepth);
  addLine("singlesSidelineLeft", TENNIS_COURT.lineWidth, TENNIS_COURT.length, -singlesHalf, netDepth);
  addLine("singlesSidelineRight", TENNIS_COURT.lineWidth, TENNIS_COURT.length, singlesHalf, netDepth);
  addLine("nearBaseline", TENNIS_COURT.doublesWidth, TENNIS_COURT.lineWidth, 0, netDepth + halfLength);
  addLine("farBaseline", TENNIS_COURT.doublesWidth, TENNIS_COURT.lineWidth, 0, netDepth - halfLength);
  addLine("nearServiceLine", TENNIS_COURT.singlesWidth, TENNIS_COURT.lineWidth, 0, netDepth + TENNIS_COURT.serviceLineDistance);
  addLine("farServiceLine", TENNIS_COURT.singlesWidth, TENNIS_COURT.lineWidth, 0, netDepth - TENNIS_COURT.serviceLineDistance);
  addLine("centerServiceLine", TENNIS_COURT.lineWidth, TENNIS_COURT.serviceLineDistance * 2, 0, netDepth);
  addLine("nearCenterMark", TENNIS_COURT.lineWidth, TENNIS_COURT.centerMarkLength, 0, netDepth + halfLength - TENNIS_COURT.centerMarkLength / 2);
  addLine("farCenterMark", TENNIS_COURT.lineWidth, TENNIS_COURT.centerMarkLength, 0, netDepth - halfLength + TENNIS_COURT.centerMarkLength / 2);

  const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0x183f38, roughness: 0.78 });
  for (const side of [-1, 1]) {
    const channel = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.035, SURROUND_LENGTH - 1), edgeMaterial);
    channel.name = side < 0 ? "courtDrainLeft" : "courtDrainRight";
    channel.position.set(side * (SURROUND_WIDTH / 2 - 0.65), 0.012, netDepth);
    channel.receiveShadow = true;
    group.add(channel);
  }
  return group;
}

export function createAuthenticTennisNet(netDepth: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "authenticTennisNet";

  const netGeometry = createSaggingNetGridGeometry(TENNIS_COURT.netWidth, 64, 15);
  const wire = new THREE.LineSegments(
    netGeometry,
    new THREE.LineBasicMaterial({ color: 0x1c2628, transparent: true, opacity: 0.82 })
  );
  wire.name = "netMesh";
  wire.position.set(0, 0.045, netDepth);
  group.add(wire);

  const band = new THREE.Mesh(
    createSaggingBandGeometry(TENNIS_COURT.netWidth, 0.075, 64),
    new THREE.MeshStandardMaterial({ color: 0xf8f6e9, roughness: 0.58, side: THREE.DoubleSide })
  );
  band.name = "netTopBand";
  band.position.set(0, 0.045, netDepth);
  band.castShadow = true;
  band.receiveShadow = true;
  group.add(band);

  const bottomTape = new THREE.Mesh(
    new THREE.BoxGeometry(TENNIS_COURT.netWidth, 0.025, 0.025),
    new THREE.MeshStandardMaterial({ color: 0xdee1da, roughness: 0.72 })
  );
  bottomTape.name = "netBottomTape";
  bottomTape.position.set(0, 0.055, netDepth);
  bottomTape.castShadow = true;
  group.add(bottomTape);

  const strap = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, TENNIS_COURT.netCenterHeight, 0.035),
    new THREE.MeshStandardMaterial({ color: 0xf6f2df, roughness: 0.68 })
  );
  strap.name = "netCenterStrap";
  strap.position.set(0, TENNIS_COURT.netCenterHeight / 2 + 0.045, netDepth);
  strap.castShadow = true;
  group.add(strap);

  const postMaterial = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.3, metalness: 0.68 });
  const capMaterial = new THREE.MeshStandardMaterial({ color: 0xe7e4d8, roughness: 0.42, metalness: 0.22 });
  for (const side of [-1, 1]) {
    const x = side * TENNIS_COURT.netWidth / 2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.072, TENNIS_COURT.netPostHeight, 20), postMaterial);
    post.name = side < 0 ? "netPostLeft" : "netPostRight";
    post.position.set(x, TENNIS_COURT.netPostHeight / 2, netDepth);
    post.castShadow = true;
    post.receiveShadow = true;
    group.add(post);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.073, 0.073, 0.035, 20), capMaterial);
    cap.name = side < 0 ? "netPostCapLeft" : "netPostCapRight";
    cap.position.set(x, TENNIS_COURT.netPostHeight + 0.012, netDepth);
    cap.castShadow = true;
    group.add(cap);

    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.045, 20), postMaterial);
    foot.name = side < 0 ? "netPostFootLeft" : "netPostFootRight";
    foot.position.set(x, 0.023, netDepth);
    foot.castShadow = true;
    group.add(foot);
  }
  return group;
}

export function createCourtBackdrop(netDepth: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "courtBackdrop";
  const farZ = netDepth - TENNIS_COURT.length / 2 - 2.35;
  const windscreenMaterial = new THREE.MeshStandardMaterial({
    color: 0x173e37,
    roughness: 0.88,
    transparent: true,
    opacity: 0.94,
    side: THREE.DoubleSide
  });

  const back = new THREE.Mesh(new THREE.PlaneGeometry(19, 4.5), windscreenMaterial);
  back.name = "farWindscreen";
  back.position.set(0, 2.25, farZ);
  back.receiveShadow = true;
  group.add(back);

  for (const side of [-1, 1]) {
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(31, 3.1), windscreenMaterial.clone());
    screen.name = side < 0 ? "sideWindscreenLeft" : "sideWindscreenRight";
    screen.rotation.y = Math.PI / 2;
    screen.position.set(side * 9.25, 1.55, netDepth - 1.5);
    screen.receiveShadow = true;
    group.add(screen);
  }

  const structureMaterial = new THREE.MeshStandardMaterial({ color: 0x33484a, roughness: 0.48, metalness: 0.52 });
  const rail = new THREE.Mesh(new THREE.BoxGeometry(19.3, 0.09, 0.09), structureMaterial);
  rail.name = "farFenceRail";
  rail.position.set(0, 4.48, farZ + 0.02);
  group.add(rail);

  for (const x of [-9.55, -4.8, 0, 4.8, 9.55]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 4.6, 10), structureMaterial);
    pole.position.set(x, 2.3, farZ + 0.04);
    pole.castShadow = true;
    group.add(pole);
  }

  const seatingMaterial = new THREE.MeshStandardMaterial({ color: 0x4c6867, roughness: 0.86 });
  for (let tier = 0; tier < 3; tier += 1) {
    const seating = new THREE.Mesh(new THREE.BoxGeometry(18 - tier * 0.8, 0.34, 1.25), seatingMaterial);
    seating.name = `farSeatingTier${tier + 1}`;
    seating.position.set(0, 0.22 + tier * 0.34, farZ - 0.8 - tier * 0.75);
    seating.receiveShadow = true;
    group.add(seating);
  }
  return group;
}

export function createFeedOriginMarker(): THREE.Group {
  const group = new THREE.Group();
  group.name = "feedOriginMarker";
  const markerMaterial = new THREE.MeshBasicMaterial({
    color: 0xc9ff38,
    transparent: true,
    opacity: 0.82,
    depthWrite: false
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.19, 0.28, 32), markerMaterial);
  ring.name = "feedOriginRing";
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.012;
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.62, 10), markerMaterial);
  beacon.name = "feedOriginBeacon";
  beacon.position.y = 0.31;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), markerMaterial);
  cap.name = "feedOriginCap";
  cap.position.y = 0.62;
  group.add(ring, beacon, cap);
  return group;
}

function addServiceBoxTone(group: THREE.Group, netDepth: number, baseMaterial: THREE.MeshStandardMaterial): void {
  const material = baseMaterial.clone();
  material.color.set(0xdcefe8);
  material.opacity = 0.045;
  material.transparent = true;
  material.depthWrite = false;
  const boxWidth = TENNIS_COURT.singlesWidth / 2;
  for (const x of [-boxWidth / 2, boxWidth / 2]) {
    for (const direction of [-1, 1]) {
      const box = new THREE.Mesh(new THREE.PlaneGeometry(boxWidth, TENNIS_COURT.serviceLineDistance), material);
      box.name = `${direction < 0 ? "far" : "near"}${x < 0 ? "Left" : "Right"}ServiceBoxTone`;
      box.rotation.x = -Math.PI / 2;
      box.position.set(x, COURT_LEVEL + 0.003, netDepth + direction * TENNIS_COURT.serviceLineDistance / 2);
      box.receiveShadow = true;
      group.add(box);
    }
  }
}

function saggedNetHeight(x: number, width: number): number {
  const edgeFactor = Math.pow(Math.min(1, Math.abs(x) / (width / 2)), 1.7);
  return THREE.MathUtils.lerp(TENNIS_COURT.netCenterHeight, TENNIS_COURT.netPostHeight, edgeFactor);
}

function createSaggingNetGridGeometry(width: number, columns: number, rows: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const bottom = 0.02;
  for (let column = 0; column <= columns; column += 1) {
    const x = -width / 2 + width * column / columns;
    positions.push(x, bottom, 0, x, saggedNetHeight(x, width), 0);
  }
  for (let row = 0; row <= rows; row += 1) {
    const fraction = row / rows;
    for (let column = 0; column < columns; column += 1) {
      const x1 = -width / 2 + width * column / columns;
      const x2 = -width / 2 + width * (column + 1) / columns;
      const y1 = THREE.MathUtils.lerp(bottom, saggedNetHeight(x1, width), fraction);
      const y2 = THREE.MathUtils.lerp(bottom, saggedNetHeight(x2, width), fraction);
      positions.push(x1, y1, 0, x2, y2, 0);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function createSaggingBandGeometry(width: number, height: number, segments: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let segment = 0; segment <= segments; segment += 1) {
    const x = -width / 2 + width * segment / segments;
    const y = saggedNetHeight(x, width);
    positions.push(x, y + height / 2, 0, x, y - height / 2, 0);
    if (segment < segments) {
      const top = segment * 2;
      indices.push(top, top + 1, top + 2, top + 2, top + 1, top + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function getSurfaceTextures(key: string, base: [number, number, number], variation: number): SurfaceTextures {
  const cached = surfaceTextureCache.get(key);
  if (cached) return cached;
  const size = 128;
  const colorData = new Uint8Array(size * size * 4);
  const roughnessData = new Uint8Array(size * size * 4);
  let seed = key === "playing" ? 2187 : 7129;
  for (let index = 0; index < size * size; index += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const noise = ((seed >>> 16) / 65535 - 0.5) * variation;
    const offset = index * 4;
    colorData[offset] = THREE.MathUtils.clamp(base[0] + noise, 0, 255);
    colorData[offset + 1] = THREE.MathUtils.clamp(base[1] + noise, 0, 255);
    colorData[offset + 2] = THREE.MathUtils.clamp(base[2] + noise, 0, 255);
    colorData[offset + 3] = 255;
    const roughness = THREE.MathUtils.clamp(205 + noise * 1.8, 150, 245);
    roughnessData[offset] = roughness;
    roughnessData[offset + 1] = roughness;
    roughnessData[offset + 2] = roughness;
    roughnessData[offset + 3] = 255;
  }
  const color = new THREE.DataTexture(colorData, size, size, THREE.RGBAFormat);
  color.colorSpace = THREE.SRGBColorSpace;
  const roughness = new THREE.DataTexture(roughnessData, size, size, THREE.RGBAFormat);
  for (const texture of [color, roughness]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(7, 13);
    texture.anisotropy = 4;
    texture.needsUpdate = true;
  }
  const textures = { color, roughness };
  surfaceTextureCache.set(key, textures);
  return textures;
}
