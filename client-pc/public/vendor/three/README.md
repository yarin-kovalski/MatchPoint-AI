# Three.js welcome assets

Local browser distribution of the project's existing Three.js **0.184.0** dependency, distributed under the included MIT license. No additional runtime framework or package was installed.

The welcome page uses these local modules so QR setup and the 3D introduction do not depend on a CDN. Files are copied unchanged from `node_modules/three`:

- `build/three.module.min.js` and `build/three.core.min.js`
- `examples/jsm/loaders/GLTFLoader.js`
- `examples/jsm/utils/BufferGeometryUtils.js` and `SkeletonUtils.js`

When upgrading the project's Three.js version, refresh all five files together and retain LICENSE. Gameplay keeps its original import map.
