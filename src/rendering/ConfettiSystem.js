import * as THREE from 'three';

/**
 * 등급별 꽃가루 폭죽 파티클 시스템.
 * 파칭코/라스베가스 느낌 — 등급이 높을수록 화려하고 오래 지속.
 */

// 등급별 세팅: 파티클 수, 발사 속도, 지속시간, 색상 팔레트
const GRADE_CONFIG = {
  C:   { count:  40,  speed: 4,  life: 1.5, colors: ['#888888', '#aaaaaa'], waves: 0 },
  B:   { count:  80,  speed: 5,  life: 2.0, colors: ['#4488ff', '#77aaff', '#aaccff'], waves: 0 },
  A:   { count: 150,  speed: 7,  life: 2.8, colors: ['#ffdd00', '#ffaa00', '#ffee66', '#ffffff'], waves: 1 },
  S:   { count: 250,  speed: 9,  life: 3.5, colors: ['#ff8800', '#ffaa00', '#ff4400', '#ffdd00', '#ffffff'], waves: 2 },
  SS:  { count: 400,  speed: 11, life: 4.5, colors: ['#ff44aa', '#ff88cc', '#ffaadd', '#ff22ff', '#ffdd00', '#ffffff'], waves: 3 },
  SSS: { count: 600,  speed: 14, life: 6.0, colors: ['#44ffff', '#ff44ff', '#ffdd00', '#44ff44', '#ff4444', '#ffffff', '#ffaa00'], waves: 5 },
};

const GRAVITY = -6;
const CONFETTI_SHAPES = ['rect', 'circle', 'star'];

export class ConfettiSystem {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this._particles = [];   // { mesh, vel, angVel, life, maxLife, shape }
    this._waves = [];        // 예약된 추가 발사 { time, origin, config }
    this._elapsed = 0;
    this._pool = [];         // 재사용 메시 풀
  }

  /**
   * 꽃가루 폭죽 발사!
   * @param {string} grade  등급 ('C'~'SSS')
   * @param {THREE.Vector3} origin  발사 위치
   */
  fire(grade, origin) {
    const cfg = GRADE_CONFIG[grade] || GRADE_CONFIG['A'];
    this._spawnBurst(origin, cfg);

    // 추가 웨이브 예약 (높은 등급일수록 여러번 연속 발사)
    for (let w = 0; w < cfg.waves; w++) {
      this._waves.push({
        time: this._elapsed + 0.3 + w * 0.5,
        origin: origin.clone(),
        config: cfg,
      });
    }
  }

  _spawnBurst(origin, cfg) {
    const colors = cfg.colors.map(c => new THREE.Color(c));

    for (let i = 0; i < cfg.count; i++) {
      const color = colors[Math.floor(Math.random() * colors.length)];
      const shape = CONFETTI_SHAPES[Math.floor(Math.random() * CONFETTI_SHAPES.length)];
      const mesh = this._getMesh(shape, color);

      mesh.position.copy(origin);
      mesh.position.x += (Math.random() - 0.5) * 0.3;
      mesh.position.z += (Math.random() - 0.5) * 0.3;

      // 발사 방향: 위쪽 반구 + 바깥으로 퍼짐
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.45;  // 위쪽 반구
      const spd = cfg.speed * (0.5 + Math.random() * 0.8);

      const vel = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * spd,
        Math.cos(phi) * spd * (0.7 + Math.random() * 0.5),
        Math.sin(phi) * Math.sin(theta) * spd,
      );

      const angVel = new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
      );

      const life = cfg.life * (0.6 + Math.random() * 0.6);
      const scale = 0.03 + Math.random() * 0.06;
      mesh.scale.setScalar(scale);
      mesh.visible = true;
      this.scene.add(mesh);

      this._particles.push({ mesh, vel, angVel, life, maxLife: life, shape });
    }
  }

  _getMesh(shape, color) {
    // 풀에서 재사용
    if (this._pool.length > 0) {
      const m = this._pool.pop();
      m.material.color.copy(color);
      m.rotation.set(0, 0, 0);
      return m;
    }

    let geo;
    switch (shape) {
      case 'circle':
        geo = _geoCircle;
        break;
      case 'star':
        geo = _geoStar;
        break;
      default:
        geo = _geoRect;
    }

    const mat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    });

    return new THREE.Mesh(geo, mat);
  }

  update(dt) {
    this._elapsed += dt;

    // 예약된 웨이브 발사
    for (let i = this._waves.length - 1; i >= 0; i--) {
      if (this._elapsed >= this._waves[i].time) {
        const w = this._waves.splice(i, 1)[0];
        this._spawnBurst(w.origin, w.config);
      }
    }

    // 파티클 업데이트
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.life -= dt;

      if (p.life <= 0) {
        p.mesh.visible = false;
        this.scene.remove(p.mesh);
        this._pool.push(p.mesh);
        this._particles.splice(i, 1);
        continue;
      }

      // 물리
      p.vel.y += GRAVITY * dt;
      // 공기 저항
      p.vel.x *= Math.pow(0.97, dt * 60);
      p.vel.z *= Math.pow(0.97, dt * 60);

      p.mesh.position.addScaledVector(p.vel, dt);

      // 회전 (종이 너풀거림)
      p.mesh.rotation.x += p.angVel.x * dt;
      p.mesh.rotation.y += p.angVel.y * dt;
      p.mesh.rotation.z += p.angVel.z * dt;

      // 페이드 아웃
      const fadeT = p.life / p.maxLife;
      p.mesh.material.opacity = Math.min(1, fadeT * 3);

      // 바닥 충돌
      if (p.mesh.position.y < 0.01) {
        p.mesh.position.y = 0.01;
        p.vel.y *= -0.2;
        p.vel.x *= 0.5;
        p.vel.z *= 0.5;
        p.angVel.multiplyScalar(0.3);
      }
    }
  }

  /** 모든 파티클 제거 */
  clear() {
    for (const p of this._particles) {
      p.mesh.visible = false;
      this.scene.remove(p.mesh);
      this._pool.push(p.mesh);
    }
    this._particles.length = 0;
    this._waves.length = 0;
  }

  get active() { return this._particles.length > 0 || this._waves.length > 0; }
}

// ── 공유 지오메트리 ──

// 직사각형 꽃가루
const _geoRect = new THREE.PlaneGeometry(1, 0.6);

// 원형 꽃가루
const _geoCircle = new THREE.CircleGeometry(0.5, 6);

// 별 모양 꽃가루
const _geoStar = (() => {
  const shape = new THREE.Shape();
  const spikes = 5, outer = 0.5, inner = 0.2;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
})();
