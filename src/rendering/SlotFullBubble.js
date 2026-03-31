import * as THREE from 'three';

/**
 * 슬롯 가득 찼을 때 표시하는 3D 빌보드 말풍선 (Sprite).
 * 카메라를 자동으로 향함. 일정 시간 후 자동 소멸.
 */

const TEX_W = 512;
const TEX_H = 256;
const TAIL_H = 38;

function drawBubble(canvas) {
  const ctx = canvas.getContext('2d');
  const w = TEX_W, h = TEX_H;
  const bodyH = h - TAIL_H;
  const r = 26;

  ctx.clearRect(0, 0, w, h);

  // 말풍선 몸통 + 꼬리 경로
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, bodyH - r);
  ctx.quadraticCurveTo(w, bodyH, w - r, bodyH);
  // 꼬리 (중앙 아래 방향)
  ctx.lineTo(w / 2 + 26, bodyH);
  ctx.lineTo(w / 2, h - 4);
  ctx.lineTo(w / 2 - 26, bodyH);
  ctx.lineTo(r, bodyH);
  ctx.quadraticCurveTo(0, bodyH, 0, bodyH - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();

  // 배경 그라데이션
  const grad = ctx.createLinearGradient(0, 0, 0, bodyH);
  grad.addColorStop(0, 'rgba(55, 8, 12, 0.96)');
  grad.addColorStop(1, 'rgba(28, 4, 8, 0.96)');
  ctx.fillStyle = grad;
  ctx.shadowColor = 'rgba(255, 70, 70, 0.5)';
  ctx.shadowBlur = 22;
  ctx.fill();
  ctx.shadowBlur = 0;

  // 테두리
  ctx.strokeStyle = 'rgba(255, 90, 90, 0.88)';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // 상단 텍스트 — 경고
  ctx.font = 'bold 40px system-ui';
  ctx.fillStyle = '#ff6666';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('슬롯이 가득 찼어요!', w / 2, bodyH * 0.45);

  // 하단 텍스트 — 안내
  ctx.font = '29px system-ui';
  ctx.fillStyle = 'rgba(255, 205, 205, 0.92)';
  ctx.fillText('먼저 판매 후 구매해 주세요 👇', w / 2, bodyH * 0.80);
}

export class SlotFullBubble {
  /**
   * @param {THREE.Scene} scene
   * @param {object} [opts]
   * @param {number} [opts.duration=3.5]  자동 숨김까지 시간(초)
   * @param {number} [opts.x=−0.4]       월드 X
   * @param {number} [opts.y=1.55]        월드 Y (높이)
   * @param {number} [opts.z=0.9]         월드 Z
   */
  constructor(scene, { duration = 3.5, x = -0.4, y = 1.55, z = 0.9 } = {}) {
    this._scene    = scene;
    this._duration = duration;
    this._timer    = 0;
    this._active   = false;
    this._baseY    = y;

    const canvas = document.createElement('canvas');
    canvas.width  = TEX_W;
    canvas.height = TEX_H;
    drawBubble(canvas);

    this._tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: this._tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this._sprite = new THREE.Sprite(mat);

    // 가로 2.2 월드 유닛, 비율 유지
    const aspect = TEX_W / TEX_H;
    this._sprite.scale.set(2.2, 2.2 / aspect, 1);
    this._sprite.position.set(x, y, z);
    this._sprite.visible = false;
    scene.add(this._sprite);
  }

  show() {
    this._sprite.visible = true;
    this._sprite.material.opacity = 1;
    this._active = true;
    this._timer  = 0;
  }

  hide() {
    this._sprite.visible = false;
    this._active = false;
    this._sprite.material.opacity = 1;
  }

  get active() { return this._active; }

  update(dt) {
    if (!this._active) return;
    this._timer += dt;

    // 살짝 위아래 둥실
    this._sprite.position.y = this._baseY + Math.sin(this._timer * 2.8) * 0.05;

    // 마지막 0.6초 페이드 아웃
    const fadeStart = this._duration - 0.6;
    if (this._timer >= fadeStart) {
      this._sprite.material.opacity = Math.max(0, 1 - (this._timer - fadeStart) / 0.6);
    }

    if (this._timer >= this._duration) {
      this.hide();
    }
  }

  dispose() {
    this._scene.remove(this._sprite);
    this._sprite.material.dispose();
    this._tex.dispose();
  }
}
