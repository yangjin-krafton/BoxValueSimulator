import * as THREE from 'three';

/**
 * 상자 안 상품 3D 렌더링.
 * GLB 모델 또는 이미지 카드를 표시.
 */

// 등급별 라이트 설정: intensity(강도), distance(범위)
const GRADE_LIGHT = {
  C:   { intensity: 1.5, distance: 3 },
  B:   { intensity: 2.5, distance: 4 },
  A:   { intensity: 3.5, distance: 5 },
  S:   { intensity: 5.0, distance: 7 },
  SS:  { intensity: 7.0, distance: 9 },
  SSS: { intensity: 10,  distance: 12 },
};

export class ProductRenderer {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../core/AssetLoader.js').AssetLoader} assetLoader
   * @param {THREE.Camera} [camera]
   */
  constructor(scene, assetLoader, camera) {
    this.assetLoader = assetLoader;
    this._camera = camera || null;
    this.pivot = new THREE.Group();
    this.pivot.scale.setScalar(0);
    scene.add(this.pivot);

    this.glowLight = new THREE.PointLight(0xffdd00, 0, 5);
    scene.add(this.glowLight);

    this._model = null;
    this._gradeLight = GRADE_LIGHT['A'];
    this._boundRadius = 0.5;   // 모델 바운드 반지름
  }

  /** 상품 모델 준비 (아직 scale=0) */
  async prepare(product, gradeInfo) {
    if (this._model) { this.pivot.remove(this._model); this._model = null; }

    try {
      if (product.type === 'card' && product.imagePath) {
        this._model = await this.assetLoader.createCardMesh(product.imagePath);
      } else if (product.modelPath) {
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
    this._gradeLight = GRADE_LIGHT[gradeInfo.grade] || GRADE_LIGHT['A'];
    this.glowLight.distance = this._gradeLight.distance;

    // 바운드 반지름 계산
    const box = new THREE.Box3().setFromObject(this._model);
    this._boundRadius = box.getSize(new THREE.Vector3()).length() / 2;
    if (this._boundRadius < 0.2) this._boundRadius = 0.5;
  }

  /** 등장 진행도 (0→1) — 상자에서 빠져나오는 동안 라이트 2배 확장 */
  setRevealProgress(t) {
    this.pivot.scale.setScalar(t);
    this.glowLight.intensity = t * this._gradeLight.intensity * 2;
    this.glowLight.distance = this._gradeLight.distance * (1 + (1 - t));  // 2x → 1x
    this._revealing = t < 1;
  }

  /** 회전 + 부유 + 라이트 펄스 */
  rotate(dt, elapsed) {
    if (this._model) this._model.rotation.y += dt * 1.1;
    this.pivot.position.y += Math.sin(elapsed * 2.2) * 0.001;

    // 상승 중이면 범위를 서서히 정상으로 복원
    if (this._revealing) {
      const d = this.glowLight.distance;
      const target = this._gradeLight.distance;
      if (d > target) {
        this.glowLight.distance = Math.max(target, d - dt * target);
      }
    }

    // 라이트 강도 펄스 (등급별 기본 강도 기준 ±15%)
    const base = this._gradeLight.intensity;
    this.glowLight.intensity = base * (0.85 + Math.sin(elapsed * 3) * 0.15);
  }

  /**
   * 라이트를 mesh와 카메라 사이, 바운드 바깥에 배치.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  _updateLightPos(x, y, z) {
    if (this._camera) {
      const meshPos = new THREE.Vector3(x, y, z);
      const camPos = this._camera.position;
      const dir = new THREE.Vector3().subVectors(camPos, meshPos).normalize();
      // 바운드 반지름 + 여유분만큼 카메라 쪽으로 오프셋
      const offset = this._boundRadius + 0.3;
      this.glowLight.position.set(
        x + dir.x * offset,
        y + dir.y * offset,
        z + dir.z * offset,
      );
    } else {
      this.glowLight.position.set(x, y + this._boundRadius + 0.3, z);
    }
  }

  /** 위치를 상자 위에 동기화 */
  syncPosition(boxPos) {
    const px = boxPos.x, py = boxPos.y + 0.38, pz = boxPos.z;
    this.pivot.position.set(px, py, pz);
    this._updateLightPos(px, py, pz);
  }

  /** 절대 위치 직접 설정 (상승 애니메이션용) */
  setPosition(x, y, z) {
    this.pivot.position.set(x, y, z);
    this._updateLightPos(x, y, z);
  }

  reset() {
    this.pivot.scale.setScalar(0);
    this.glowLight.intensity = 0;
    this._revealing = false;
    if (this._model) { this.pivot.remove(this._model); this._model = null; }
  }
}
