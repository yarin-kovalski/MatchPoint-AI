import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

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
const LINE_LEVEL = 0.010;
const SURROUND_WIDTH = 21;
const SURROUND_LENGTH = 36;

interface SurfaceTextures {
  color: THREE.DataTexture;
  roughness: THREE.DataTexture;
  normal: THREE.DataTexture;
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

  const surroundMaps = getSurfaceTextures("surround", [38, 105, 67], 10);
  const surround = new THREE.Mesh(
    new THREE.PlaneGeometry(SURROUND_WIDTH, SURROUND_LENGTH),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: surroundMaps.color,
      roughness: 0.92,
      roughnessMap: surroundMaps.roughness,
      normalMap: surroundMaps.normal,
      normalScale: new THREE.Vector2(0.12, 0.12),
      metalness: 0
    })
  );
  surround.name = "courtSurround";
  surround.rotation.x = -Math.PI / 2;
  surround.position.set(0, 0, netDepth);
  surround.receiveShadow = true;
  group.add(surround);

  const courtMaps = getSurfaceTextures("playing", [43, 112, 151], 8);
  const surfaceMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: courtMaps.color,
    roughness: 0.84,
    roughnessMap: courtMaps.roughness,
    normalMap: courtMaps.normal,
    normalScale: new THREE.Vector2(0.1, 0.1),
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
    const line = new THREE.Mesh(new THREE.BoxGeometry(width, 0.001, depth), lineMaterial);
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

  const wire = new THREE.Mesh(createNetCordGeometry(),
    new THREE.MeshLambertMaterial({ color: 0x18231f }));
  wire.name = "netMesh";
  wire.castShadow = false; // Subpixel cord shadows shimmer; band/posts cast stable shadows.
  wire.receiveShadow = true;
  const netLod = new THREE.LOD();
  netLod.position.set(0, 0.045, netDepth);
  netLod.addLevel(wire, 0);
  netLod.addLevel(createFilteredNetMesh(), 7);
  group.add(netLod);

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
  const fenceMaterial = createChainLinkMaterial();
  const farFence = new THREE.Mesh(new THREE.PlaneGeometry(19, 4.8), fenceMaterial);
  farFence.name = "farChainLinkFence";
  farFence.position.set(0, 2.4, farZ);
  group.add(farFence);

  const legacyBack = new THREE.Group();
  legacyBack.name = "farWindscreen";
  group.add(legacyBack);
  const structureMaterial = new THREE.MeshStandardMaterial({ color: 0x12191b, roughness: 0.34, metalness: 0.72 });
  addFenceFrame(group, "far", 19, 4.8, new THREE.Vector3(0, 0, farZ), false, structureMaterial);

  for (const side of [-1, 1]) {
    const fence = new THREE.Mesh(new THREE.PlaneGeometry(31, 4.8), fenceMaterial);
    fence.name = side < 0 ? "leftChainLinkFence" : "rightChainLinkFence";
    fence.rotation.y = Math.PI / 2;
    fence.position.set(side * 9.25, 2.4, netDepth - 1.5);
    group.add(fence);
    const legacy = new THREE.Group();
    legacy.name = side < 0 ? "sideWindscreenLeft" : "sideWindscreenRight";
    group.add(legacy);
    addFenceFrame(group, side < 0 ? "left" : "right", 31, 4.8,
      new THREE.Vector3(side * 9.25, 0, netDepth - 1.5), true, structureMaterial);
  }

  const seatingMaterial = new THREE.MeshStandardMaterial({ color: 0x697b72, roughness: 0.9 });
  for (let tier = 0; tier < 3; tier += 1) {
    const seating = new THREE.Mesh(new THREE.BoxGeometry(18 - tier * 0.8, 0.34, 1.25), seatingMaterial);
    seating.name = `farSeatingTier${tier + 1}`;
    seating.position.set(0, 0.22 + tier * 0.34, farZ - 0.8 - tier * 0.75);
    seating.receiveShadow = true;
    group.add(seating);
  }
  const foliage = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8),
    new THREE.MeshLambertMaterial({ color: 0x466f45 }), 18);
  foliage.name = "distantTreeCanopy";
  const transform = new THREE.Object3D();
  for (let i = 0; i < 18; i++) {
    transform.position.set(-26 + i * 3.2, 2.5 + Math.sin(i * 1.7) * 0.5, farZ - 11 - (i % 3));
    transform.scale.set(3.2, 2.7 + (i % 3) * 0.4, 3);
    transform.rotation.y = i * 0.7;
    transform.updateMatrix();
    foliage.setMatrixAt(i, transform.matrix);
  }
  group.add(foliage);
  return group;
}

function createChainLinkMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { wireColor: { value: new THREE.Color(0x101719) } },
    vertexShader: `varying vec2 fenceUv; void main(){fenceUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 fenceUv; uniform vec3 wireColor; void main(){
      vec2 cell=vec2(fenceUv.x*44.,fenceUv.y*12.);float a=abs(fract(cell.x+cell.y)-.5);
      float b=abs(fract(cell.x-cell.y)-.5);float width=max(fwidth(a),fwidth(b))*1.25;
      float wire=1.-smoothstep(.025,.025+width,min(a,b));if(wire<.06)discard;
      gl_FragColor=vec4(wireColor,wire*.9);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  });
}

function addFenceFrame(group: THREE.Group, prefix: string, length: number, height: number,
  origin: THREE.Vector3, alongZ: boolean, material: THREE.Material): void {
  const railGeometry = alongZ
    ? new THREE.BoxGeometry(0.085, 0.085, length + 0.18)
    : new THREE.BoxGeometry(length + 0.18, 0.085, 0.085);
  for (const [name, y] of [["BottomRail", 0.08], ["TopRail", height]] as const) {
    const rail = new THREE.Mesh(railGeometry, material);
    rail.name = `${prefix}Fence${name}`;
    rail.position.set(origin.x, y, origin.z);
    rail.castShadow = true;
    group.add(rail);
  }
  const spacing = 4.65;
  const count = Math.ceil(length / spacing);
  for (let index = 0; index <= count; index += 1) {
    const offset = -length / 2 + length * index / count;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, height + 0.16, 10), material);
    post.name = `${prefix}FencePost${index + 1}`;
    post.position.set(origin.x + (alongZ ? 0 : offset), (height + 0.16) / 2, origin.z + (alongZ ? offset : 0));
    post.castShadow = true;
    group.add(post);
  }
}

/** Analytically filtered cord coverage prevents moire once 40mm cells become subpixel. */
function createFilteredNetMesh(): THREE.Mesh {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let i = 0; i <= 64; i++) {
    const x = TENNIS_COURT.netWidth * (i / 64 - 0.5);
    positions.push(x, 0.02, 0, x, saggedNetHeight(x, TENNIS_COURT.netWidth), 0);
    uvs.push(i / 64 * 320, 0, i / 64 * 320, 24);
    if (i < 64) { const j = i * 2; indices.push(j,j+2,j+1,j+1,j+2,j+3); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec2 cell; void main(){cell=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 cell; void main(){
      vec2 width=max(fwidth(cell),vec2(.001));
      vec2 distanceToCord=abs(fract(cell+.5)-.5);
      vec2 coverage=1.-smoothstep(vec2(.0375)-width*.5,vec2(.0375)+width*.5,distanceToCord);
      coverage=mix(coverage,vec2(.075),smoothstep(vec2(.4),vec2(1.2),width));
      gl_FragColor=vec4(.055,.075,.065,1.-(1.-coverage.x)*(1.-coverage.y));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  }));
  mesh.name = "filteredNetCords";
  return mesh;
}

function createNetCordGeometry(): THREE.BufferGeometry {
  const width = TENNIS_COURT.netWidth;
  const columns = 320; // 40 mm mesh openings, rather than 200 mm placeholder grid.
  const rows = 24;
  const geometries: THREE.BufferGeometry[] = [];
  const cordRadius = 0.0015;
  for (let column = 0; column <= columns; column++) {
    const x = -width / 2 + width * column / columns;
    const height = saggedNetHeight(x, width) - 0.02;
    geometries.push(new THREE.CylinderGeometry(cordRadius, cordRadius, height, 4, 1, true)
      .translate(x, 0.02 + height / 2, 0));
  }
  for (let row = 0; row <= rows; row++) {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i++) {
      const x = -width / 2 + width * i / 64;
      points.push(new THREE.Vector3(x, THREE.MathUtils.lerp(0.02, saggedNetHeight(x, width), row / rows), 0));
    }
    geometries.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, cordRadius, 4, false));
  }
  const merged = mergeGeometries(geometries, false);
  for (const geometry of geometries) geometry.dispose();
  merged.computeBoundingSphere();
  return merged;
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
  // Tint only: the underlying court already supplies PBR shading and shadows.
  const material = new THREE.MeshBasicMaterial({ color: 0xdcefe8,
    opacity: 0.035, transparent: true, depthWrite: false });
  const boxWidth = TENNIS_COURT.singlesWidth / 2;
  for (const x of [-boxWidth / 2, boxWidth / 2]) {
    for (const direction of [-1, 1]) {
      const box = new THREE.Mesh(new THREE.PlaneGeometry(boxWidth, TENNIS_COURT.serviceLineDistance), material);
      box.name = `${direction < 0 ? "far" : "near"}${x < 0 ? "Left" : "Right"}ServiceBoxTone`;
      box.rotation.x = -Math.PI / 2;
      box.position.set(x, COURT_LEVEL + 0.003, netDepth + direction * TENNIS_COURT.serviceLineDistance / 2);
      box.receiveShadow = false;
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
  // Bake tiny grain normals once, avoiding repeated height derivatives per pixel.
  const normalData = new Uint8Array(size * size * 4);
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const i=(y*size+x)*4;
    normalData[i]=128+(roughnessData[(y*size+(x+size-1)%size)*4]-roughnessData[(y*size+(x+1)%size)*4])*.5;
    normalData[i+1]=128+(roughnessData[(((y+size-1)%size)*size+x)*4]-roughnessData[(((y+1)%size)*size+x)*4])*.5;
    normalData[i+2]=255; normalData[i+3]=255;
  }
  const normal = new THREE.DataTexture(normalData,size,size,THREE.RGBAFormat);
  for (const texture of [color, roughness, normal]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(7, 13);
    // Mip filtering is sufficient for this subtle grain. Four anisotropic
    // samples per map doubled software-renderer frame cost in the D7 audit.
    texture.anisotropy = 1;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapNearestFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
  }
  const textures = { color, roughness, normal };
  surfaceTextureCache.set(key, textures);
  return textures;
}
