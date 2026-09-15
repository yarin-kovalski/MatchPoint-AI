import * as THREE from "three";

/** Budget the wider, more detailed court; HTML controls remain at native resolution. */
export function courtPixelRatio(width: number, height: number, deviceRatio: number): number {
  return Math.min(deviceRatio, 1.5, Math.sqrt(700_000 / Math.max(1, width * height)));
}

/** Reusable, deterministic microtexture. No downloads or per-frame work. */
export function createMicroTexture(size = 128): THREE.DataTexture {
  const pixels = new Uint8Array(size * size * 4);
  let state = 701;
  for (let i = 0; i < pixels.length; i += 4) {
    state = (1664525 * state + 1013904223) >>> 0;
    const value = 180 + (state >>> 27);
    pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
    pixels[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createSoftContactShadowTexture(): THREE.DataTexture {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const radius = Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1);
    const i = (y * size + x) * 4;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
    pixels[i + 3] = Math.round(255 * Math.pow(Math.max(0, 1 - radius), 2));
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createSkyDome(): THREE.Mesh {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 18), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      zenith: { value: new THREE.Color(0x168bd1) },
      middle: { value: new THREE.Color(0x70c9ef) },
      horizon: { value: new THREE.Color(0xe8f7ff) }
    },
    vertexShader: `uniform vec3 zenith; uniform vec3 horizon; varying vec3 skyColor;
      uniform vec3 middle;
      void main(){float h=clamp(normalize(position).y,0.,1.);skyColor=h<.32
        ?mix(horizon,middle,smoothstep(0.,.32,h))
        :mix(middle,zenith,smoothstep(.32,1.,h));
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 skyColor;
      void main(){gl_FragColor=vec4(skyColor,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`
  }));
  sky.name = "premiumSky";
  return sky;
}

export function addPremiumEnvironment(scene: THREE.Scene, _renderer: THREE.WebGLRenderer): THREE.Group {
  const environment = new THREE.Group();
  environment.name = "outdoorEnvironment";
  environment.add(createSkyDome(), createSun(), createCloudField(), createBirdFlock());
  scene.add(environment);
  return environment;
}

export function updatePremiumEnvironment(environment: THREE.Object3D, elapsed: number): void {
  const clouds = environment.getObjectByName("movingClouds");
  if (clouds) {
    clouds.children.forEach((cloud, index) => {
      const originX = Number(cloud.userData.originX ?? cloud.position.x);
      cloud.position.x = ((originX + elapsed * (0.18 + index * 0.025) + 31) % 62) - 31;
    });
  }
  const birds = environment.getObjectByName("flyingBirds");
  if (birds) {
    birds.position.x = -18 + (elapsed * 1.25) % 42;
    birds.position.y = 11.5 + Math.sin(elapsed * 0.55) * 0.45;
    birds.children.forEach((bird, index) => {
      const wing = Math.sin(elapsed * 5.5 + index * 1.3);
      bird.scale.y = 0.7 + Math.abs(wing) * 0.65;
    });
  }
}

function createSun(): THREE.Group {
  const sun = new THREE.Group();
  sun.name = "daylightSun";
  sun.position.set(-25, 24, -55);
  const sunTexture = createRadialGlowTexture();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTexture, color: 0xffe8a3, transparent: true,
    opacity: 0.72, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  glow.name = "sunGlow";
  glow.scale.set(11, 11, 1);
  const disc = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTexture, color: 0xfff4c2, transparent: true, opacity: 1, depthWrite: false
  }));
  disc.name = "sunDisc";
  disc.scale.set(2.2, 2.2, 1);
  sun.add(glow, disc);
  return sun;
}

function createCloudField(): THREE.Group {
  const field = new THREE.Group();
  field.name = "movingClouds";
  const material = new THREE.MeshLambertMaterial({
    color: 0xffffff, transparent: true, opacity: 0.78, depthWrite: false
  });
  const geometry = new THREE.SphereGeometry(1, 10, 7);
  const placements = [
    [-25, 15, -48, 4.2], [-7, 18, -58, 5.3], [16, 14, -51, 3.8], [31, 20, -64, 5.8]
  ];
  placements.forEach(([x, y, z, size], cloudIndex) => {
    const cloud = new THREE.Group();
    cloud.name = `cloud${cloudIndex + 1}`;
    cloud.position.set(x, y, z);
    cloud.userData.originX = x;
    for (let puff = 0; puff < 6; puff += 1) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set((puff - 2.5) * size * 0.42, Math.sin(puff * 1.8) * size * 0.13, 0);
      mesh.scale.set(size * (0.55 + (puff % 3) * 0.12), size * (0.28 + (puff % 2) * 0.09), size * 0.34);
      mesh.frustumCulled = true;
      cloud.add(mesh);
    }
    field.add(cloud);
  });
  return field;
}

function createBirdFlock(): THREE.Group {
  const flock = new THREE.Group();
  flock.name = "flyingBirds";
  flock.position.set(-18, 11.5, -34);
  const material = new THREE.LineBasicMaterial({ color: 0x17252b, transparent: true, opacity: 0.82 });
  const positions = [-0.42, 0, 0, 0, 0.14, 0, 0.42, 0, 0];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  [[0, 0], [1.2, 0.5], [2.3, -0.15], [3.3, 0.6], [4.6, 0.15]].forEach(([x, y], index) => {
    const bird = new THREE.Line(geometry, material);
    bird.name = `bird${index + 1}`;
    bird.position.set(x, y, index * -0.8);
    bird.scale.setScalar(0.72 + index * 0.04);
    flock.add(bird);
  });
  return flock;
}

function createRadialGlowTexture(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const distance = Math.hypot(x / (size - 1) * 2 - 1, y / (size - 1) * 2 - 1);
    const alpha = Math.pow(Math.max(0, 1 - distance), 2.2);
    const offset = (y * size + x) * 4;
    data[offset] = 255; data[offset + 1] = 244; data[offset + 2] = 190;
    data[offset + 3] = Math.round(alpha * 255);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

/** Preserve every vertex and transform in the validated GLB. Only replace finishes. */
export function finishPremiumRacket(model: THREE.Object3D): void {
  const micro = createMicroTexture();
  micro.repeat.set(5, 30);
  const frame = new THREE.MeshPhysicalMaterial({ color: 0x263c3d, roughness: 0.34,
    metalness: 0.28, clearcoat: 0.42, clearcoatRoughness: 0.3 });
  frame.name = "premiumCompositeFrame";
  const strings = new THREE.MeshStandardMaterial({ color: 0xe2dfc6, roughness: 0.76, metalness: 0 });
  strings.name = "premiumStrings";
  const grip = new THREE.MeshStandardMaterial({ color: 0xe8e1d0, roughness: 0.96,
    bumpMap: micro, bumpScale: 0.025 });
  grip.name = "premiumGrip";
  model.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const old = node.material as THREE.Material;
    const name = old.name;
    node.material = name === "Mat.2" ? frame : name === "None" ? grip : strings;
    node.castShadow = node.receiveShadow = true;
    // Strings already have real geometry; fewer shadow triangles keep the frame
    // silhouette stable without adding a flickering wire pattern to the ground.
    if (node.material === strings) node.castShadow = false;
  });
}

export function impactSquashScale(strength: number, ageSeconds: number, target: THREE.Vector3): THREE.Vector3 {
  const pulse = ageSeconds >= 0 && ageSeconds < 0.12 ? Math.sin(Math.PI * ageSeconds / 0.12) : 0;
  const compression = Math.min(0.13, Math.max(0, strength) * 0.003) * pulse;
  const spread = 1 / Math.sqrt(1 - compression);
  return target.set(spread, spread, 1 - compression);
}
