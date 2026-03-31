import * as THREE from 'three';

/**
 * 3D 바닥 위에 놓이는 캔버스 텍스처 UI 요소의 베이스 클래스.
 *
 * 사용법:
 *   class MyButton extends FloorElement {
 *     draw(ctx, w, h, hover) { ... }
 *   }
 *   const btn = new MyButton(sceneMgr, parentGroup, { width:2, depth:0.6, ... });
 *   btn.show();
 *
 * 서브클래스는 draw() 만 오버라이드하면 됨.
 */

const DEFAULT_FLOOR_Y = 0.06;

export class FloorElement {
  /**
   * @param {object}  sceneMgr      SceneManager (renderer 접근용)
   * @param {THREE.Group} parent    씬에 추가할 부모 그룹
   * @param {object}  opts
   * @param {number}  opts.width    3D 월드 너비
   * @param {number}  opts.depth    3D 월드 깊이
   * @param {number}  [opts.texWidth=400]   캔버스 픽셀 너비
   * @param {number}  [opts.texHeight=120]  캔버스 픽셀 높이
   * @param {number}  [opts.x=0]    월드 X 위치
   * @param {number}  [opts.z=0]    월드 Z 위치
   * @param {number}  [opts.y]      월드 Y 위치 (기본 FLOOR_Y+0.01)
   * @param {boolean} [opts.visible=false]  초기 표시 여부
   */
  constructor(sceneMgr, parent, opts = {}) {
    this.sceneMgr = sceneMgr;
    this._parent = parent;
    this._hover = false;
    this._onClick = null;

    const {
      width = 2, depth = 0.6,
      texWidth = 400, texHeight = 120,
      x = 0, z = 0,
      y = DEFAULT_FLOOR_Y + 0.01,
      visible = false,
    } = opts;

    this.texWidth = texWidth;
    this.texHeight = texHeight;

    // 캔버스 + 텍스처
    this._canvas = document.createElement('canvas');
    this._canvas.width = texWidth;
    this._canvas.height = texHeight;
    this._ctx = this._canvas.getContext('2d');
    this._tex = new THREE.CanvasTexture(this._canvas);
    this._tex.anisotropy = sceneMgr.renderer.capabilities.getMaxAnisotropy();

    // 메시
    const mat = new THREE.MeshStandardMaterial({
      map: this._tex, roughness: 0.5, metalness: 0.1,
      transparent: true, polygonOffset: true, polygonOffsetFactor: -2,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(x, y, z);
    this.mesh.receiveShadow = true;
    this.mesh.visible = visible;
    this.mesh.userData._floorElement = this;
    parent.add(this.mesh);

    // 초기 그리기
    this.redraw();
  }

  /** 서브클래스에서 오버라이드 — 캔버스에 그리기 */
  draw(ctx, w, h, hover) {}

  /** 캔버스를 다시 그리고 텍스처 갱신 */
  redraw() {
    this._ctx.clearRect(0, 0, this.texWidth, this.texHeight);
    this.draw(this._ctx, this.texWidth, this.texHeight, this._hover);
    this._tex.needsUpdate = true;
  }

  // ── 표시 ──

  show()  { this.mesh.visible = true;  this.redraw(); }
  hide()  { this.mesh.visible = false; this._hover = false; }
  get visible() { return this.mesh.visible; }
  setVisible(v) { v ? this.show() : this.hide(); }

  // ── 호버 ──

  setHover(hover) {
    if (!this.mesh.visible) return;
    if (hover === this._hover) return;
    this._hover = hover;
    this.redraw();
  }

  get isHover() { return this._hover; }

  // ── 클릭 ──

  onClick(fn) { this._onClick = fn; return this; }

  /** FloorUIManager 가 호출 */
  _fireClick() { if (this._onClick) this._onClick(); }

  // ── 히트 ──

  getHitTarget() { return this.mesh.visible ? this.mesh : null; }

  // ── 서브클래스 유틸 ──

  /** 둥근 사각형 경로 */
  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  /** 프레임 업데이트 (필요 시 오버라이드) */
  update(dt, elapsed) {}

  dispose() {
    this._parent.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this._tex.dispose();
  }
}
