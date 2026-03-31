import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/**
 * GLB 모델 로드 + 캐싱.
 * 같은 경로는 한 번만 네트워크 요청, 이후 clone.
 * Draco 압축된 GLB 자동 디코딩.
 */
export class AssetLoader {
  #loader = (() => {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/');
    loader.setDRACOLoader(draco);
    return loader;
  })();
  #texLoader = new THREE.TextureLoader();
  /** @type {Map<string, THREE.Group>} */
  #cache = new Map();
  /** @type {Map<string, Promise<THREE.Group>>} */
  #loading = new Map();
  /** @type {Map<string, THREE.Texture>} */
  #texCache = new Map();

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

  /** 텍스처 로드 + 캐싱 (matcap 등) */
  async loadTexture(path) {
    const cached = this.#texCache.get(path);
    if (cached) return cached;
    return new Promise((resolve, reject) => {
      this.#texLoader.load(
        path,
        (tex) => { this.#texCache.set(path, tex); resolve(tex); },
        undefined,
        reject,
      );
    });
  }

  /**
   * 이미지 기반 3D 카드 메시 생성.
   * 앞면: 이미지 텍스처, 뒷면: 카드 뒷면 패턴.
   * @param {string} imagePath - 카드 이미지 경로
   * @returns {Promise<THREE.Group>}
   */
  async createCardMesh(imagePath) {
    const texture = await this.loadTexture(imagePath);
    texture.colorSpace = THREE.SRGBColorSpace;

    const aspect = texture.image ? texture.image.width / texture.image.height : 0.714;
    const cardHeight = 0.55;
    const cardWidth = cardHeight * aspect;
    const cardDepth = 0.008;

    // 앞면 (이미지)
    const frontGeo = new THREE.PlaneGeometry(cardWidth, cardHeight);
    const frontMat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.3,
      metalness: 0.1,
    });
    const front = new THREE.Mesh(frontGeo, frontMat);
    front.position.z = cardDepth / 2 + 0.001;
    front.castShadow = true;

    // 뒷면 (카드 뒷면)
    const backGeo = new THREE.PlaneGeometry(cardWidth, cardHeight);
    const backMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a3e,
      roughness: 0.4,
      metalness: 0.3,
    });
    const back = new THREE.Mesh(backGeo, backMat);
    back.rotation.y = Math.PI;
    back.position.z = -(cardDepth / 2 + 0.001);
    back.castShadow = true;

    // 테두리 (두께)
    const edgeGeo = new THREE.BoxGeometry(cardWidth + 0.006, cardHeight + 0.006, cardDepth);
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.2,
      metalness: 0.8,
    });
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    edge.castShadow = true;

    const group = new THREE.Group();
    group.add(edge);
    group.add(front);
    group.add(back);
    group.scale.setScalar(1.5);
    return group;
  }

  /** 모델을 상자 내부 크기에 맞춤 */
  fitToBox(model, targetSize = 1.2) {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) model.scale.setScalar(targetSize / maxDim);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center.multiplyScalar(model.scale.x));
  }
}
