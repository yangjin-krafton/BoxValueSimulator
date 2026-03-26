import * as THREE from 'three';

/**
 * 상자 안 상품 3D 렌더링.
 * PBR 프리셋 → MeshPhysicalMaterial 파라미터 override
 * Matcap 프리셋 → MeshMatcapMaterial로 교체
 */
export class ProductRenderer {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../core/AssetLoader.js').AssetLoader} assetLoader
   */
  constructor(scene, assetLoader) {
    this.assetLoader = assetLoader;
    this.pivot = new THREE.Group();
    this.pivot.scale.setScalar(0);
    scene.add(this.pivot);

    this.glowLight = new THREE.PointLight(0xffdd00, 0, 5);
    scene.add(this.glowLight);

    this._model = null;
  }

  /** 상품 모델 준비 (아직 scale=0) */
  async prepare(product, gradeInfo) {
    if (this._model) { this.pivot.remove(this._model); this._model = null; }

    try {
      if (product.modelPath) {
        this._model = await this.assetLoader.loadGLB(product.modelPath);
        this.assetLoader.fitToBox(this._model);
        if (product.preset) await this.#applyPreset(this._model, product.preset);
      } else {
        throw new Error('no model');
      }
    } catch {
      this._model = this.assetLoader.createFallbackMesh(gradeInfo.color);
    }

    this.pivot.add(this._model);
    this.glowLight.color.setHex(gradeInfo.color);
  }

  /** 프리셋 적용 — PBR 또는 Matcap */
  async #applyPreset(model, preset) {
    if (!preset || preset.key === 'plastic_matte') return; // 기본 = 원본 유지

    if (preset.type === 'matcap') {
      await this.#applyMatcap(model, preset);
    } else {
      this.#applyPBR(model, preset);
    }
  }

  /** PBR: MeshPhysicalMaterial 파라미터 override (원본 텍스처 유지) */
  #applyPBR(model, preset) {
    const p = preset.params;
    model.traverse((child) => {
      if (!child.isMesh) return;
      const mat = child.material;
      if (!mat) return;

      // MeshPhysicalMaterial로 업그레이드 (clearcoat/sheen/transmission 지원)
      if (!mat.isMeshPhysicalMaterial && (p.clearcoat || p.sheen || p.transmission)) {
        const phys = new THREE.MeshPhysicalMaterial({
          color: mat.color?.clone(),
          map: mat.map,
          normalMap: mat.normalMap,
          roughnessMap: mat.roughnessMap,
          metalnessMap: mat.metalnessMap,
          aoMap: mat.aoMap,
          emissiveMap: mat.emissiveMap,
          emissive: mat.emissive?.clone(),
          metalness: mat.metalness ?? 0,
          roughness: mat.roughness ?? 1,
          side: mat.side,
        });
        child.material = phys;
      }

      const m = child.material;
      if (p.metalness != null)           m.metalness = p.metalness;
      if (p.roughness != null)           m.roughness = p.roughness;
      if (p.clearcoat != null)           m.clearcoat = p.clearcoat;
      if (p.clearcoatRoughness != null)  m.clearcoatRoughness = p.clearcoatRoughness;
      if (p.sheen != null)               m.sheen = p.sheen;
      if (p.sheenRoughness != null)      m.sheenRoughness = p.sheenRoughness;
      if (p.ior != null)                 m.ior = p.ior;

      if (p.transmission > 0) {
        m.transmission = p.transmission;
        m.transparent = true;
        m.opacity = p.opacity ?? 0.5;
      } else if (p.opacity < 1) {
        m.transparent = true;
        m.opacity = p.opacity;
      }

      m.needsUpdate = true;
    });
  }

  /** Matcap: 모든 메시를 MeshMatcapMaterial로 교체 */
  async #applyMatcap(model, preset) {
    const matcapTex = await this.assetLoader.loadTexture(preset.texture);

    model.traverse((child) => {
      if (!child.isMesh) return;
      const oldMat = child.material;

      const matcapMat = new THREE.MeshMatcapMaterial({
        matcap: matcapTex,
        color: oldMat.color?.clone() ?? new THREE.Color(0xffffff),
      });

      child.material = matcapMat;
    });
  }

  /** 등장 진행도 (0→1) */
  setRevealProgress(t) {
    this.pivot.scale.setScalar(t);
    this.glowLight.intensity = t * 3.5;
  }

  /** 회전 + 부유 */
  rotate(dt, elapsed) {
    if (this._model) this._model.rotation.y += dt * 1.1;
    this.pivot.position.y += Math.sin(elapsed * 2.2) * 0.001;
  }

  /** 위치를 상자 위에 동기화 */
  syncPosition(boxPos) {
    this.pivot.position.set(boxPos.x, boxPos.y + 0.38, boxPos.z);
    this.glowLight.position.set(boxPos.x, boxPos.y + 0.9, boxPos.z);
  }

  /** 절대 위치 직접 설정 (상승 애니메이션용) */
  setPosition(x, y, z) {
    this.pivot.position.set(x, y, z);
    this.glowLight.position.set(x, y + 0.5, z);
  }

  reset() {
    this.pivot.scale.setScalar(0);
    this.glowLight.intensity = 0;
    if (this._model) { this.pivot.remove(this._model); this._model = null; }
  }
}
