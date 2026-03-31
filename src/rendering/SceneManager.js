import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
/**
 * Three.js 씬, 카메라, 렌더러, 조명, 바닥 관리.
 */
const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

export class SceneManager {
  constructor() {
    // Renderer — 모바일은 경량 설정
    this.renderer = new THREE.WebGLRenderer({
      antialias: !isMobile,
      powerPreference: isMobile ? 'high-performance' : 'default',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = isMobile ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;
    document.body.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1c2e);
    this.scene.fog = new THREE.FogExp2(0x1a1c2e, 0.045);

    // Camera — 세로 뷰: 보드(중앙) + 타워(뒤쪽)
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 120);
    this.camera.position.set(0, 8, 7);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.3, -1.5);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 18;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.update();

    this.clock = new THREE.Clock();

    this._spotFlicker = false;
    this._spotFlickerT = 0;

    this._setupLighting();
    this._setupFloor();
    this._setupHDR();
    this._setupResize();
    this._setupFade();
  }

  get canvas() { return this.renderer.domElement; }

  _setupLighting() {
    this.scene.add(new THREE.AmbientLight(0x445566, 0.6));

    const shadowRes = isMobile ? 1024 : 2048;

    const sun = new THREE.DirectionalLight(0xfff5e0, 1.2);
    sun.position.set(4, 8, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(shadowRes, shadowRes);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -10;
    sun.shadow.camera.right = sun.shadow.camera.top = 10;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 40;
    sun.shadow.bias = -0.002;
    this.scene.add(sun);

    // 스포트라이트 — 보드 중앙을 향하되 타워도 비추도록
    const spotPos = new THREE.Vector3(0, 10, 2);
    const spotTarget = new THREE.Vector3(0, -2, -2);
    const spotAngle = Math.PI / 6;

    this.spot = new THREE.SpotLight(0xffe0a0, 2.8);
    this.spot.position.copy(spotPos);
    this.spot.angle = spotAngle;
    this.spot.penumbra = 0.25;
    this.spot.decay = 1.0;
    this.spot.castShadow = !isMobile;
    this.spot.shadow.mapSize.set(isMobile ? 512 : 1024, isMobile ? 512 : 1024);
    this.spot.shadow.bias = -0.002;
    this.spot.target.position.copy(spotTarget);
    this.scene.add(this.spot);
    this.scene.add(this.spot.target);
    this._spotBaseIntensity = 2.8;

    const area = new THREE.PointLight(0x6688ff, 0.6, 8);
    area.position.set(0, 3, 2);
    this.scene.add(area);
  }

  /** 16종 그라데이션 팔레트 — [중심, 중간1, 중간2, 가장자리, 배경/안개] */
  static FLOOR_PALETTES = [
    // 0. 청보라 (기본)
    ['#3a3a58', '#272840', '#181928', '#0e0f1c', '#1a1c2e'],
    // 1. 딥 레드
    ['#4a1c2c', '#321420', '#1e0d14', '#10080c', '#1c0e14'],
    // 2. 에메랄드 그린
    ['#1a3d2e', '#122a1f', '#0c1c14', '#07100b', '#0e1c14'],
    // 3. 골드 앰버
    ['#3d2e0a', '#2a1f07', '#1a1305', '#0e0a02', '#1c1508'],
    // 4. 로즈 핑크
    ['#3d1a2e', '#2a1220', '#1a0c14', '#0e0609', '#1c0e18'],
    // 5. 오션 블루
    ['#0d2e4a', '#091f32', '#06131e', '#030a10', '#0a1c2e'],
    // 6. 라벤더
    ['#2e2a4a', '#1f1d32', '#13121e', '#0a0a10', '#181828'],
    // 7. 버건디
    ['#3a1018', '#280b10', '#180709', '#0c0404', '#180a0c'],
    // 8. 시안 네온
    ['#0d3a3a', '#092828', '#061818', '#030d0d', '#0a1e1e'],
    // 9. 선셋 오렌지
    ['#3a1e0a', '#281506', '#180d03', '#0c0602', '#1c1008'],
    // 10. 미드나잇 인디고
    ['#1a1050', '#110a36', '#0b061e', '#060310', '#100830'],
    // 11. 포레스트
    ['#162a14', '#0f1d0e', '#091208', '#040904', '#0c1a0a'],
    // 12. 스틸 그레이
    ['#2e3240', '#1e222e', '#13161e', '#0a0c10', '#181c28'],
    // 13. 딥 플럼
    ['#2e1040', '#1f0a2c', '#13061c', '#09030e', '#180824'],
    // 14. 브론즈
    ['#3a2010', '#28150a', '#180d06', '#0c0602', '#1c1008'],
    // 15. 아이스 블루
    ['#1a2e3a', '#121f28', '#0b1318', '#05090c', '#101c24'],
  ];

  _setupFloor() {
    // 캔버스 + 재질 저장 (나중에 교체 가능)
    this._floorCanvas = document.createElement('canvas');
    this._floorCanvas.width = this._floorCanvas.height = 512;
    this._floorCtx = this._floorCanvas.getContext('2d');
    this._floorTex = new THREE.CanvasTexture(this._floorCanvas);
    this._floorMat = new THREE.MeshStandardMaterial({ map: this._floorTex, roughness: 0.92 });

    this._applyFloorPalette(SceneManager.FLOOR_PALETTES[0]);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      this._floorMat
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  _applyFloorPalette([c0, c1, c2, c3, bg]) {
    const ctx = this._floorCtx;
    const s = this._floorCanvas.width;
    const cx = s / 2;
    const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    grad.addColorStop(0,    c0);
    grad.addColorStop(0.35, c1);
    grad.addColorStop(0.7,  c2);
    grad.addColorStop(1,    c3);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
    this._floorTex.needsUpdate = true;

    const bgColor = new THREE.Color(bg);
    this.scene.background = bgColor;
    this.scene.fog.color.copy(bgColor);
  }

  /** 16종 팔레트 중 하나를 랜덤 선택해 바닥 그라데이션 교체 */
  randomizeFloorPalette() {
    const palettes = SceneManager.FLOOR_PALETTES;
    const idx = Math.floor(Math.random() * palettes.length);
    this._applyFloorPalette(palettes[idx]);
    this._loadHDR(this._pickHDRForPalette(idx));
  }

  // ── HDR 환경맵 ──

  /** HDR 환경 프리셋: 배경 분위기별 HDR + 톤/강도 */
  static HDR_PRESETS = [
    { file: 'assets/hdri/studio_small_09_1k.hdr', intensity: 1.5 },
    { file: 'assets/hdri/studio_small_03_1k.hdr', intensity: 1.2 },
    { file: 'assets/hdri/moonless_golf_1k.hdr',   intensity: 0.9 },
  ];

  _setupHDR() {
    this._rgbeLoader = new RGBELoader();
    this._pmrem = new THREE.PMREMGenerator(this.renderer);
    this._pmrem.compileEquirectangularShader();
    this._hdrCache = new Map();

    // 기본 HDR 로드
    this._loadHDR(SceneManager.HDR_PRESETS[0]);
  }

  _loadHDR(preset) {
    const cached = this._hdrCache.get(preset.file);
    if (cached) {
      this._applyHDR(cached, preset.intensity);
      return;
    }

    this._rgbeLoader.load(preset.file, (texture) => {
      const envMap = this._pmrem.fromEquirectangular(texture).texture;
      texture.dispose();
      this._hdrCache.set(preset.file, envMap);
      this._applyHDR(envMap, preset.intensity);
    });
  }

  _applyHDR(envMap, intensity) {
    this.scene.environment = envMap;
    // environment만 설정 (background는 기존 팔레트 색상 유지)
    if (this.scene.environmentIntensity !== undefined) {
      this.scene.environmentIntensity = intensity;
    }
  }

  /** 팔레트 변경 시 HDR 프리셋도 매칭 */
  _pickHDRForPalette(paletteIndex) {
    const presets = SceneManager.HDR_PRESETS;
    // 어두운 팔레트(7,8,10,13)→moonless, 나머지→studio 교대
    const darkPalettes = [7, 8, 10, 13];
    if (darkPalettes.includes(paletteIndex)) {
      return presets[2]; // moonless_golf (어두운 환경)
    }
    return presets[paletteIndex % 2]; // studio 09/03 교대
  }

  _setupResize() {
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  // ── Fade 시스템 ──

  _setupFade() {
    // 전체 화면 위에 검은 오버레이
    this._fadeEl = document.createElement('div');
    Object.assign(this._fadeEl.style, {
      position: 'fixed', inset: '0', background: '#000',
      opacity: '0', pointerEvents: 'none', zIndex: '50',
      transition: 'none',
    });
    document.body.appendChild(this._fadeEl);

    this._fading = false;
    this._fadeT = 0;
    this._fadeDur = 0;
    this._fadeHalf = false;
    this._fadeOnMid = null;
    this._fadeOnDone = null;
  }

  /**
   * fade out → onMid 콜백 → fade in → onDone.
   * @param {number} duration  전체 시간 (초)
   * @param {function} onMid   어두워진 시점 콜백
   * @param {function} [onDone] 밝아진 뒤 콜백
   */
  fadeTransition(duration, onMid, onDone) {
    this._fading = true;
    this._fadeT = 0;
    this._fadeDur = duration;
    this._fadeHalf = false;
    this._fadeOnMid = onMid;
    this._fadeOnDone = onDone || null;
    // spot 끄기
    this.spot.intensity = 0;
  }

  _updateFade(dt) {
    if (!this._fading) return;
    this._fadeT += dt;
    const half = this._fadeDur / 2;

    if (this._fadeT < half) {
      // fade out (0→1)
      const t = this._fadeT / half;
      this._fadeEl.style.opacity = t.toString();
    } else {
      // 중간 콜백
      if (!this._fadeHalf) {
        this._fadeHalf = true;
        this._fadeEl.style.opacity = '1';
        if (this._fadeOnMid) this._fadeOnMid();
        // spot 깜빡 시작
        this._spotFlicker = true;
        this._spotFlickerT = 0;
      }
      // fade in (1→0)
      const t = (this._fadeT - half) / half;
      this._fadeEl.style.opacity = Math.max(0, 1 - t).toString();

      if (this._fadeT >= this._fadeDur) {
        this._fading = false;
        this._fadeEl.style.opacity = '0';
        if (this._fadeOnDone) this._fadeOnDone();
      }
    }
  }

  // ── Spot 깜빡 연출 ──

  _updateSpotFlicker(dt) {
    if (!this._spotFlicker) return;
    this._spotFlickerT += dt;
    const t = this._spotFlickerT;

    if (t < 0.15) {
      this.spot.intensity = this._spotBaseIntensity * 0.3;
    } else if (t < 0.25) {
      this.spot.intensity = 0;
    } else if (t < 0.4) {
      this.spot.intensity = this._spotBaseIntensity * 0.6;
    } else if (t < 0.5) {
      this.spot.intensity = this._spotBaseIntensity * 0.15;
    } else if (t < 0.7) {
      this.spot.intensity = this._spotBaseIntensity * 0.8;
    } else if (t < 0.8) {
      this.spot.intensity = this._spotBaseIntensity * 0.4;
    } else if (t < 1.0) {
      // 최종 점등
      const p = (t - 0.8) / 0.2;
      this.spot.intensity = this._spotBaseIntensity * (0.4 + p * 0.6);
    } else {
      this.spot.intensity = this._spotBaseIntensity;
      this._spotFlicker = false;
    }
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /** @param {(dt: number) => void} update */
  startLoop(update) {
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this._updateFade(dt);
      this._updateSpotFlicker(dt);
      update(dt);
      this.render();
    });
  }
}
