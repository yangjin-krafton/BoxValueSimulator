import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * GLB 모델 로드 + 캐싱.
 * 같은 경로는 한 번만 네트워크 요청, 이후 clone.
 */
export class AssetLoader {
  #loader = new GLTFLoader();
  /** @type {Map<string, THREE.Group>} */
  #cache = new Map();
  /** @type {Map<string, Promise<THREE.Group>>} */
  #loading = new Map();

  /** @param {string} path  @returns {Promise<THREE.Group>} */
  async loadGLB(path) {
    const cached = this.#cache.get(path);
    if (cached) return cached.clone();

    const pending = this.#loading.get(path);
    if (pending) return (await pending).clone();

    const promise = new Promise((resolve, reject) => {
      this.#loader.load(
        path,
        (gltf) => {
          this.#cache.set(path, gltf.scene);
          this.#loading.delete(path);
          resolve(gltf.scene.clone());
        },
        undefined,
        (err) => { this.#loading.delete(path); reject(err); }
      );
    });
    this.#loading.set(path, promise);
    return promise;
  }

  /** GLB 없을 때 폴백 도형 (개발용) */
  createFallbackMesh(color) {
    const shapes = [
      new THREE.BoxGeometry(0.28, 0.32, 0.28),
      new THREE.SphereGeometry(0.19, 20, 20),
      new THREE.ConeGeometry(0.15, 0.38, 8),
      new THREE.TorusGeometry(0.15, 0.055, 12, 30),
      new THREE.OctahedronGeometry(0.2),
    ];
    const geo = shapes[Math.floor(Math.random() * shapes.length)];
    const mat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.45,
      roughness: 0.2, metalness: 0.75,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    const group = new THREE.Group();
    group.add(mesh);
    return group;
  }

  /** 모델을 상자 내부 크기에 맞춤 */
  fitToBox(model, targetSize = 0.6) {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) model.scale.setScalar(targetSize / maxDim);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center.multiplyScalar(model.scale.x));
  }
}
