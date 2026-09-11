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
  const sky = new THREE.Mesh(new THREE.SphereGeometry(80, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { zenith: { value: new THREE.Color(0x789bac) }, horizon: { value: new THREE.Color(0xd8e2de) } },
    vertexShader: `uniform vec3 zenith; uniform vec3 horizon; varying vec3 skyColor;
      void main(){float h=pow(max(normalize(position).y,0.),.55);skyColor=mix(horizon,zenith,h);
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

export function addPremiumEnvironment(scene: THREE.Scene, _renderer: THREE.WebGLRenderer): void {
  scene.add(createSkyDome());
  // Hemisphere and directional fill supply outdoor environment lighting without
  // the per-fragment cube-UV lookup cost measured in the software-renderer audit.
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
