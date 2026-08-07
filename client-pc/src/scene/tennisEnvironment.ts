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

export function configureAuthenticRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
}

export function createAuthenticCourt(netDepth: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "authenticTennisCourt";
  const surround = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 31),
    new THREE.MeshStandardMaterial({ color: 0x183f35, roughness: 0.94, metalness: 0 })
  );
  surround.name = "courtSurround";
  surround.rotation.x = -Math.PI / 2;
  surround.position.set(0, 0, netDepth);
  surround.receiveShadow = true;
  group.add(surround);

  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(TENNIS_COURT.doublesWidth, TENNIS_COURT.length),
    new THREE.MeshStandardMaterial({ color: 0x287f72, roughness: 0.88, metalness: 0 })
  );
  surface.name = "playingSurface";
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(0, 0.006, netDepth);
  surface.receiveShadow = true;
  group.add(surface);

  const lineMaterial = new THREE.MeshStandardMaterial({ color: 0xf4f2df, roughness: 0.72, metalness: 0 });
  const halfLength = TENNIS_COURT.length / 2;
  const doublesHalf = TENNIS_COURT.doublesWidth / 2;
  const singlesHalf = TENNIS_COURT.singlesWidth / 2;
  const addLine = (name: string, width: number, depth: number, x: number, z: number): void => {
    const line = new THREE.Mesh(new THREE.BoxGeometry(width, 0.018, depth), lineMaterial);
    line.name = name;
    line.position.set(x, 0.018, z);
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
  return group;
}

export function createAuthenticTennisNet(netDepth: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "authenticTennisNet";
  const netGeometry = createNetGridGeometry(TENNIS_COURT.netWidth, TENNIS_COURT.netCenterHeight, 48, 9);
  const wire = new THREE.LineSegments(
    netGeometry,
    new THREE.LineBasicMaterial({ color: 0xd9dfdc, transparent: true, opacity: 0.58 })
  );
  wire.name = "netMesh";
  wire.position.set(0, TENNIS_COURT.netCenterHeight / 2, netDepth);
  group.add(wire);

  const band = new THREE.Mesh(
    new THREE.BoxGeometry(TENNIS_COURT.netWidth, 0.07, 0.045),
    new THREE.MeshStandardMaterial({ color: 0xf7f5e9, roughness: 0.65 })
  );
  band.name = "netTopBand";
  band.position.set(0, TENNIS_COURT.netCenterHeight, netDepth);
  band.castShadow = true;
  group.add(band);

  const postMaterial = new THREE.MeshStandardMaterial({ color: 0x27313a, roughness: 0.42, metalness: 0.55 });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, TENNIS_COURT.netPostHeight, 18), postMaterial);
    post.name = side < 0 ? "netPostLeft" : "netPostRight";
    post.position.set(side * TENNIS_COURT.netWidth / 2, TENNIS_COURT.netPostHeight / 2, netDepth);
    post.castShadow = true;
    group.add(post);
  }
  return group;
}

function createNetGridGeometry(width: number, height: number, columns: number, rows: number): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let column = 0; column <= columns; column += 1) {
    const x = -width / 2 + width * column / columns;
    positions.push(x, -height / 2, 0, x, height / 2, 0);
  }
  for (let row = 0; row <= rows; row += 1) {
    const y = -height / 2 + height * row / rows;
    positions.push(-width / 2, y, 0, width / 2, y, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

export function createCourtBackdrop(netDepth: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "courtBackdrop";
  const material = new THREE.MeshStandardMaterial({ color: 0x102b28, roughness: 0.9, side: THREE.DoubleSide });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), material);
  back.position.set(0, 2, netDepth - TENNIS_COURT.length / 2 - 2.4);
  back.receiveShadow = true;
  group.add(back);
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
