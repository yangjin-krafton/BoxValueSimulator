import * as THREE from 'three';

const VERT = `
attribute float aSeed;
attribute float aWeight;

uniform float time;
uniform float drift;
uniform float size;
uniform float lightDist;

varying float vAlpha;
varying float vWeight;

void main() {
  vec3 p = position;
  float heightT = clamp(-p.y / lightDist, 0.0, 1.0);
  float swirl = sin(time * (0.8 + aSeed * 1.4) + aSeed * 31.4 + p.y * 0.45);
  float sway  = cos(time * (1.0 + aSeed * 1.1) + aSeed * 22.7 + p.y * 0.35);
  float radiusFade = 1.0 - heightT;
  p.x += swirl * drift * 0.22 * radiusFade;
  p.z += sway  * drift * 0.22 * radiusFade;

  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float perspective = 260.0 / max(20.0, -mvPosition.z);
  float nearScale = smoothstep(0.0, 0.5, heightT);
  gl_PointSize = size * (0.45 + aWeight * 0.8) * perspective * nearScale;

  float depthFade = 1.0 - smoothstep(0.65, 1.0, heightT);
  vAlpha = depthFade * nearScale * (0.35 + aWeight * 0.65);
  vWeight = aWeight;
}
`;

const FRAG = `
uniform vec3 color;
uniform float density;
uniform float intensity;

varying float vAlpha;
varying float vWeight;

void main() {
  vec2 center = gl_PointCoord - 0.5;
  float d = length(center) * 2.0;
  float sprite = smoothstep(1.0, 0.2, d);
  float core = smoothstep(0.55, 0.0, d);
  float alpha = density * vAlpha * sprite;
  vec3 shaded = color * (0.55 + vWeight * 0.45) * intensity;
  gl_FragColor = vec4(shaded + core * color * 0.35, alpha);
}
`;

const MAX_PARTICLES = 3000;

export class VolumetricParticles {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @param {{
   *   position: THREE.Vector3,
   *   target: THREE.Vector3,
   *   color: number,
   *   angle: number,
   *   distance: number,
   *   particles?: number,
   *   density?: number,
   *   size?: number,
   *   drift?: number,
   *   brightness?: number
   * }} config
   */
  constructor(scene, camera, config) {
    this.scene = scene;
    this.camera = camera;

    const pos = config.position.clone();
    const tgt = config.target.clone();
    const dir = new THREE.Vector3().subVectors(tgt, pos).normalize();
    const dist = pos.distanceTo(tgt);
    const angle = config.angle ?? 0.4;
    const particleCount = config.particles ?? 2000;

    // Build geometry — cone distribution
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const seeds = new Float32Array(MAX_PARTICLES);
    const weights = new Float32Array(MAX_PARTICLES);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const t = Math.pow(Math.random(), 0.8);
      const y = -dist * t;
      const radius = Math.tan(angle) * dist * t;
      const theta = Math.random() * Math.PI * 2;
      const r = radius * Math.sqrt(Math.random());

      positions[i * 3]     = Math.cos(theta) * r;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(theta) * r;
      seeds[i] = Math.random();
      weights[i] = Math.random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute('aWeight', new THREE.BufferAttribute(weights, 1));
    geometry.setDrawRange(0, particleCount);

    this.uniforms = {
      time:      { value: 0 },
      drift:     { value: config.drift ?? 0.35 },
      size:      { value: config.size ?? 30 },
      lightDist: { value: dist },
      color:     { value: new THREE.Color(config.color) },
      density:   { value: config.density ?? 0.06 },
      intensity: { value: config.brightness ?? 1.5 },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.position.copy(pos);
    this.points.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    this.points.layers.set(1);
    this.points.renderOrder = 2;

    camera.layers.enable(1);
    scene.add(this.points);

    this.geometry = geometry;
  }

  update(time) {
    this.uniforms.time.value = time;
  }

  dispose() {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.points.material.dispose();
  }
}
