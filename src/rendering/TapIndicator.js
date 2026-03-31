import * as THREE from 'three';

/**
 * 3D 탭 안내 핀.
 * "여기를 클릭하세요" — 위아래 바운스 + 회전 + 펄스 글로우.
 */

const _isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

// ── 지오메트리 (공유) ──
// 아래쪽 화살표 콘
const coneGeo = new THREE.ConeGeometry(0.15, 0.35, _isMobile ? 6 : 8);
// 바깥 링
const ringGeo = new THREE.TorusGeometry(0.25, 0.03, 8, _isMobile ? 16 : 24);

export class TapIndicator {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;

    // 그룹
    this.group = new THREE.Group();
    this.group.visible = false;

    // 화살표 (아래쪽을 가리킴)
    const coneMat = new THREE.MeshPhongMaterial({
      color: 0xffcc00,
      emissive: 0xff8800,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.9,
    });
    this._cone = new THREE.Mesh(coneGeo, coneMat);
    this._cone.rotation.x = Math.PI;   // 꼭짓점이 아래
    this.group.add(this._cone);

    // 펄스 링 (바닥에서 확장)
    const ringMat = new THREE.MeshPhongMaterial({
      color: 0xffee55,
      emissive: 0xffaa00,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.7,
    });
    this._ring = new THREE.Mesh(ringGeo, ringMat);
    this._ring.rotation.x = -Math.PI / 2;
    this._ring.position.y = -0.25;
    this.group.add(this._ring);

    // 포인트 라이트 (글로우)
    this._light = new THREE.PointLight(0xffcc00, 0, 3);
    this.group.add(this._light);

    scene.add(this.group);

    this._baseY = 0;
    this._elapsed = 0;
  }

  /**
   * 특정 위치에 핀 표시.
   * @param {THREE.Vector3} pos     대상 위치
   * @param {number} [heightOffset] 대상 위에 추가 높이 (기본 0.8)
   */
  show(pos, heightOffset = 0.8) {
    this._baseY = pos.y + heightOffset;
    this.group.position.set(pos.x, this._baseY, pos.z);
    this.group.visible = true;
    this._light.intensity = 1.5;
    this._elapsed = 0;
  }

  hide() {
    this.group.visible = false;
    this._light.intensity = 0;
  }

  /**
   * 매 프레임 호출 — 바운스 + 회전 + 펄스.
   */
  update(dt) {
    if (!this.group.visible) return;
    this._elapsed += dt;
    const t = this._elapsed;

    // 위아래 바운스 (사인파)
    this.group.position.y = this._baseY + Math.sin(t * 3.5) * 0.15;

    // Y축 회전
    this._cone.rotation.y += dt * 2.0;

    // 링 펄스 (확장 + 페이드)
    const pulse = (t * 1.5) % 1;            // 0→1 반복
    const ringScale = 1 + pulse * 1.2;
    this._ring.scale.setScalar(ringScale);
    this._ring.material.opacity = 0.7 * (1 - pulse);

    // 글로우 펄스
    this._light.intensity = 1.0 + Math.sin(t * 4) * 0.5;
  }
}
