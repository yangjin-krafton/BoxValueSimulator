import * as THREE from 'three';

/**
 * 3D 코인 파티클 시스템.
 * - 구매 시: 코인이 중앙에서 뿌려져 바닥에 착지
 * - 판매 시: 상품 위치에서 폭발 → 화면 하단 HUD로 흡수
 */

const GRAVITY = -14;
const BOUNCE = 0.35;
const FLOOR_Y = 0.02;
const _isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const COIN_SCALE = 0.06;

// 공유 geometry: 납작한 원기둥 (코인)
const coinGeo = new THREE.CylinderGeometry(1, 1, 0.2, _isMobile ? 8 : 12);
const coinMats = [
  new THREE.MeshPhongMaterial({ color: 0xffd700, emissive: 0xaa8800, emissiveIntensity: 0.3, shininess: 100 }),
  new THREE.MeshPhongMaterial({ color: 0xffb800, emissive: 0x886600, emissiveIntensity: 0.3, shininess: 80 }),
  new THREE.MeshPhongMaterial({ color: 0xffe066, emissive: 0xaa9900, emissiveIntensity: 0.3, shininess: 90 }),
];

export class CoinSystem {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    /** @type {Array<{mesh, vel, angVel, settled, mode, life, target}>} */
    this._coins = [];
    this._pool = [];

    /** 코인 산 */
    this._pileCoins = [];
    this._pileAmount = 0;
    this._pileCallback = null;
    this._pileCollecting = false;
    this._pileClickHandler = null;
  }

  /**
   * 구매: 코인을 공중에서 뿌림 (바닥 착지)
   * @param {number} amount  금액
   * @param {THREE.Vector3} origin  뿌릴 중심 위치
   */
  spendCoins(amount, target) {
    const count = Math.min(_isMobile ? 40 : 80, Math.max(3, Math.floor(amount / 1000)));

    // 카메라 하단 실시간 좌표에서 발사
    const launchBase = this._getHudWorldPos();

    // 타겟 방향
    const dir = new THREE.Vector3().subVectors(target, launchBase).normalize();

    for (let i = 0; i < count; i++) {
      const coin = this._getCoin();

      // 시작: 카메라 하단 근처에서 약간 랜덤 퍼짐
      coin.mesh.position.set(
        launchBase.x + (Math.random() - 0.5) * 0.8,
        launchBase.y + (Math.random() - 0.5) * 0.3,
        launchBase.z + (Math.random() - 0.5) * 0.5,
      );
      coin.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      coin.mesh.scale.setScalar(COIN_SCALE * (0.7 + Math.random() * 0.6));

      // 속도: 타겟 방향 + 위쪽 포물선 + 좌우 랜덤
      const spd = 6 + Math.random() * 4;
      coin.vel = new THREE.Vector3(
        dir.x * spd + (Math.random() - 0.5) * 3,
        dir.y * spd + 3 + Math.random() * 3,    // 위로 솟구쳐 포물선
        dir.z * spd + (Math.random() - 0.5) * 2,
      );
      coin.angVel = new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 12,
      );
      coin.settled = false;
      coin.mode = 'drop';
      coin.life = 5 + Math.random() * 3;
      coin.mesh.material.opacity = 1;
      coin.mesh.visible = true;
      this.scene.add(coin.mesh);
      this._coins.push(coin);
    }
  }

  /**
   * 판매: 상품 위치에서 폭발 → 화면 하단 HUD로 흡수
   * @param {number} amount  금액
   * @param {THREE.Vector3} origin  상품 위치
   */
  earnCoins(amount, origin) {
    const count = Math.min(_isMobile ? 25 : 50, Math.max(5, Math.floor(amount / 3000)));

    for (let i = 0; i < count; i++) {
      const coin = this._getCoin();
      coin.mesh.position.copy(origin);
      coin.mesh.position.x += (Math.random() - 0.5) * 0.5;
      coin.mesh.position.y += (Math.random() - 0.5) * 0.5;
      coin.mesh.position.z += (Math.random() - 0.5) * 0.5;
      coin.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      coin.mesh.scale.setScalar(COIN_SCALE * (0.7 + Math.random() * 0.6));

      // 초기 폭발 속도 (밖으로 퍼짐)
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.6;
      const spd = 3 + Math.random() * 4;
      coin.vel = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * spd,
        Math.cos(phi) * spd * 0.5 + 2,
        Math.sin(phi) * Math.sin(theta) * spd,
      );
      coin.angVel = new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
      );
      coin.settled = false;
      coin.mode = 'explode';
      coin.life = 0.4 + Math.random() * 0.3;
      coin.target = null;   // 실시간 계산
      coin.mesh.material.opacity = 1;
      coin.mesh.visible = true;
      this.scene.add(coin.mesh);
      this._coins.push(coin);
    }
  }

  /** 카메라 하단 월드 좌표를 실시간 계산 */
  _getHudWorldPos() {
    return new THREE.Vector3(0, -0.85, 0.5).unproject(this.camera);
  }

  update(dt) {
    for (let i = this._coins.length - 1; i >= 0; i--) {
      const c = this._coins[i];

      if (c.mode === 'drop') {
        this._updateDrop(c, dt);
      } else if (c.mode === 'explode') {
        this._updateExplode(c, dt);
      } else if (c.mode === 'absorb') {
        this._updateAbsorb(c, dt);
      }

      // 제거 판정
      if (c.mode === 'remove') {
        c.mesh.visible = false;
        this.scene.remove(c.mesh);
        this._pool.push(c);
        this._coins.splice(i, 1);
      }
    }

    // 코인 산 흡수 업데이트
    for (let i = this._pileCoins.length - 1; i >= 0; i--) {
      const c = this._pileCoins[i];
      if (c.mode === 'pile_absorb') {
        this._updatePileAbsorb(c, dt);
      }
      if (c.mode === 'remove') {
        c.mesh.visible = false;
        this.scene.remove(c.mesh);
        this._pool.push(c);
        this._pileCoins.splice(i, 1);
      }
    }
  }

  _updateDrop(c, dt) {
    if (!c.settled) {
      c.vel.y += GRAVITY * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.angVel.x * dt;
      c.mesh.rotation.z += c.angVel.z * dt;

      if (c.mesh.position.y <= FLOOR_Y) {
        c.mesh.position.y = FLOOR_Y;
        c.vel.y *= -BOUNCE;
        c.vel.x *= 0.5;
        c.vel.z *= 0.5;
        c.angVel.multiplyScalar(0.3);
        if (Math.abs(c.vel.y) < 0.15) {
          c.settled = true;
          c.vel.set(0, 0, 0);
          c.angVel.set(0, 0, 0);
          // 바닥에 눕히기
          c.mesh.rotation.x = Math.PI / 2;
          c.mesh.rotation.z = Math.random() * Math.PI;
        }
      }
    }

    // 바닥에서 서서히 사라짐
    if (c.settled) {
      c.life -= dt;
      if (c.life < 1) {
        c.mesh.material.opacity = Math.max(0, c.life);
      }
      if (c.life <= 0) c.mode = 'remove';
    }
  }

  _updateExplode(c, dt) {
    // 폭발 후 감속
    c.vel.y += GRAVITY * 0.3 * dt;
    c.vel.multiplyScalar(Math.pow(0.92, dt * 60));
    c.mesh.position.addScaledVector(c.vel, dt);
    c.mesh.rotation.x += c.angVel.x * dt;
    c.mesh.rotation.y += c.angVel.y * dt;

    c.life -= dt;
    if (c.life <= 0) {
      c.mode = 'absorb';
      c.life = 0.6 + Math.random() * 0.3;   // 흡수 시간
      c._absorbSpeed = 0;
    }
  }

  _updateAbsorb(c, dt) {
    c.life -= dt;
    c._absorbSpeed += dt * 25;   // 가속

    // 실시간 카메라 하단 좌표로 흡수
    const target = this._getHudWorldPos();
    const dir = target.sub(c.mesh.position);
    const dist = dir.length();
    if (dist < 0.3 || c.life <= 0) {
      c.mode = 'remove';
      return;
    }
    dir.normalize();
    c.mesh.position.addScaledVector(dir, c._absorbSpeed * dt);

    // 축소
    const s = c.mesh.scale.x * (1 - dt * 2);
    c.mesh.scale.setScalar(Math.max(0.01, s));

    // 빠른 회전
    c.mesh.rotation.y += dt * 15;
  }

  /** 바닥 코인 즉시 제거 */
  clearFloor() {
    for (let i = this._coins.length - 1; i >= 0; i--) {
      const c = this._coins[i];
      if (c.mode === 'drop') {
        c.mesh.visible = false;
        this.scene.remove(c.mesh);
        this._pool.push(c);
        this._coins.splice(i, 1);
      }
    }
  }

  get active() { return this._coins.length > 0 || this._pileCoins.length > 0; }

  // ── 코인 산 (오프라인 보상) ──

  /**
   * 바닥 중앙에 코인 산을 쌓음.
   * @param {number} amount  보상 금액
   * @param {function} onCollect  클릭 시 콜백(amount)
   */
  /**
   * @returns {number} 코인 산 꼭대기 Y좌표
   */
  spawnPile(amount, onCollect) {
    this._pileAmount = amount;
    this._pileCallback = onCollect;
    this._pileCoins = [];
    this._pileCollecting = false;

    const count = Math.min(_isMobile ? 40 : 80, Math.max(10, Math.floor(amount / 1000)));
    const cx = 0, cz = 0;
    this._pileTopY = FLOOR_Y;

    // 피라미드 형태로 코인 배치
    for (let i = 0; i < count; i++) {
      const coin = this._getCoin();
      const layer = Math.floor(Math.sqrt(i));
      const r = 0.15 + layer * 0.12;
      const angle = i * 2.4 + layer * 1.1;   // 황금각 나선

      const coinY = FLOOR_Y + layer * 0.015 + Math.random() * 0.01;
      coin.mesh.position.set(
        cx + Math.cos(angle) * r * (0.5 + Math.random() * 0.5),
        coinY,
        cz + Math.sin(angle) * r * (0.5 + Math.random() * 0.5),
      );
      if (coinY > this._pileTopY) this._pileTopY = coinY;
      coin.mesh.rotation.set(Math.PI / 2, Math.random() * Math.PI, Math.random() * 0.3);
      const s = COIN_SCALE * (0.8 + Math.random() * 0.4);
      coin.mesh.scale.setScalar(s);
      coin.mesh.material.opacity = 1;
      coin.mesh.visible = true;
      coin.settled = true;
      coin.mode = 'pile';
      coin.life = 999;

      this.scene.add(coin.mesh);
      this._pileCoins.push(coin);
    }

    // 보이지 않는 큰 히트 영역 (코인 산 위에 배치)
    const hitGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.3, 16);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this._pileHitArea = new THREE.Mesh(hitGeo, hitMat);
    this._pileHitArea.position.set(cx, this._pileTopY + 0.1, cz);
    this.scene.add(this._pileHitArea);

    // 클릭 이벤트 (넓은 히트 영역 사용)
    this._pileClickHandler = (e) => {
      if (this._pileCollecting || this._pileCoins.length === 0) return;
      const mouse = new THREE.Vector2(
        e.clientX / innerWidth * 2 - 1,
        -(e.clientY / innerHeight) * 2 + 1,
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(mouse, this.camera);
      if (ray.intersectObject(this._pileHitArea).length > 0) {
        this._collectPile();
      }
    };
    addEventListener('pointerdown', this._pileClickHandler);

    return this._pileTopY;
  }

  /** 코인 산 꼭대기 Y */
  get pileTopY() { return this._pileTopY || FLOOR_Y; }

  _collectPile() {
    this._pileCollecting = true;
    removeEventListener('pointerdown', this._pileClickHandler);
    if (this._pileHitArea) {
      this.scene.remove(this._pileHitArea);
      this._pileHitArea = null;
    }

    // 코인 하나씩 시간차로 HUD로 흡수
    const interval = 0.04;
    this._pileCoins.forEach((c, i) => {
      c._collectDelay = i * interval;
      c.mode = 'pile_absorb';
      c.life = 1.0;
      c._absorbSpeed = 0;
    });

    // 콜백
    if (this._pileCallback) {
      this._pileCallback(this._pileAmount);
    }
  }

  _updatePileAbsorb(c, dt) {
    if (c._collectDelay > 0) {
      c._collectDelay -= dt;
      return;
    }

    c.life -= dt;
    c._absorbSpeed += dt * 30;

    const target = this._getHudWorldPos();
    const dir = target.sub(c.mesh.position);
    const dist = dir.length();
    if (dist < 0.3 || c.life <= 0) {
      c.mode = 'remove';
      return;
    }
    dir.normalize();
    c.mesh.position.addScaledVector(dir, c._absorbSpeed * dt);

    const s = c.mesh.scale.x * (1 - dt * 2.5);
    c.mesh.scale.setScalar(Math.max(0.01, s));
    c.mesh.rotation.y += dt * 15;
  }

  get hasPile() { return this._pileCoins.length > 0; }

  _getCoin() {
    if (this._pool.length > 0) {
      const c = this._pool.pop();
      c.settled = false;
      c.mode = 'drop';
      return c;
    }
    const mat = coinMats[Math.floor(Math.random() * coinMats.length)].clone();
    mat.transparent = true;
    const mesh = new THREE.Mesh(coinGeo, mat);
    return { mesh, vel: new THREE.Vector3(), angVel: new THREE.Vector3(), settled: false, mode: 'drop', life: 5, target: null };
  }
}
