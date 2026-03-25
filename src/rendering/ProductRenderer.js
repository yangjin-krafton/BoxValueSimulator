import * as THREE from 'three';

/**
 * 상자 안 상품 3D 렌더링.
 * GLB 또는 폴백 도형 표시, 등장/회전 애니메이션.
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
      } else {
        throw new Error('no model');
      }
    } catch {
      this._model = this.assetLoader.createFallbackMesh(gradeInfo.color);
    }

    this.pivot.add(this._model);
    this.glowLight.color.setHex(gradeInfo.color);
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

  reset() {
    this.pivot.scale.setScalar(0);
    this.glowLight.intensity = 0;
    if (this._model) { this.pivot.remove(this._model); this._model = null; }
  }
}
