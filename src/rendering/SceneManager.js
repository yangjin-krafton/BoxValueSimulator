import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Three.js 씬, 카메라, 렌더러, 조명, 바닥 관리.
 */
export class SceneManager {
  constructor() {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    document.body.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e15);
    this.scene.fog = new THREE.FogExp2(0x0a0e15, 0.045);

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 120);
    this.camera.position.set(0, 5, 9);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1, -1);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 16;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.update();

    this.clock = new THREE.Clock();

    this._setupLighting();
    this._setupFloor();
    this._setupResize();
  }

  get canvas() { return this.renderer.domElement; }

  _setupLighting() {
    this.scene.add(new THREE.AmbientLight(0x334466, 0.8));

    const sun = new THREE.DirectionalLight(0xfff5e0, 1.2);
    sun.position.set(4, 8, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -10;
    sun.shadow.camera.right = sun.shadow.camera.top = 10;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 40;
    sun.shadow.bias = -0.002;
    this.scene.add(sun);

    const spot = new THREE.SpotLight(0xffe0a0, 2.8);
    spot.position.set(0, 9, -2.5);
    spot.angle = Math.PI / 5.5;
    spot.penumbra = 0.4;
    spot.decay = 0;
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.002;
    spot.target.position.set(0, 1.5, -5.2);
    this.scene.add(spot);
    this.scene.add(spot.target);

    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(2.8, 8.5, 24, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffe8c0, transparent: true, opacity: 0.06,
        side: THREE.BackSide, depthWrite: false,
      })
    );
    beam.position.set(0, 5.2, -3.85);
    beam.rotation.x = 0.35;
    beam.renderOrder = 1;
    this.scene.add(beam);

    const area = new THREE.PointLight(0x6688ff, 0.6, 8);
    area.position.set(0, 3, 2);
    this.scene.add(area);
  }

  _setupFloor() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0x0c1018, roughness: 0.95 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const BX = 1.85, BZ = 1.55;
    const marker = new THREE.Mesh(
      new THREE.PlaneGeometry(BX * 2, BZ * 2),
      new THREE.MeshStandardMaterial({ color: 0x13201a, roughness: 0.92 })
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.001;
    marker.receiveShadow = true;
    this.scene.add(marker);

    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -BX,.004,-BZ, BX,.004,-BZ,  BX,.004,-BZ, BX,.004,BZ,
       BX,.004, BZ,-BX,.004, BZ, -BX,.004, BZ,-BX,.004,-BZ,
    ]), 3));
    this.scene.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x2a6632 })));
  }

  _setupResize() {
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /** @param {(dt: number) => void} update */
  startLoop(update) {
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.05);
      update(dt);
      this.render();
    });
  }
}
