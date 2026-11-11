import * as THREE from '../vendor/three.module.min.js';

/**
 * Hero 3D scene (v2): compact floating Frazia emblem + wide acoustic aura
 * framing the live macOS demo window without adding dead vertical whitespace.
 *
 * - Anchors the glossy 3D icon tile to #stage-emblem (top-right corner of demo)
 *   while radiating wide sound-wave rings behind the demo stage.
 * - Reacts to 'vh-demo' events: listening, recognizing, inserted.
 * - Adapts to system dark mode AND explicit documentElement[data-theme].
 * - Pauses off-screen / hidden tab; renders a single still frame under
 *   prefers-reduced-motion: reduce.
 */

const BAR_HEIGHTS = [126, 242, 358, 242, 126].map((h) => h / 358);
const TILE = 4;
const ENERGY = { listening: 1, recognizing: 0.62, inserted: 0.16 };

export class HeroScene {
  constructor({ canvas, host, anchor, stageFrame }) {
    this.canvas = canvas;
    this.host = host;
    this.anchor = anchor;
    this.stageFrame = stageFrame || anchor;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.pointer = new THREE.Vector2();
    this.pointerTarget = new THREE.Vector2();
    this.energy = 1;
    this.energyTarget = 1;
    this.sweep = 0;
    this.visible = true;
    this.running = false;
    this.clock = new THREE.Clock();
    this.time = 0;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'low-power',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    this.camera.position.set(0, 0, 30);

    this.auraGroup = new THREE.Group();
    this.tileStage = new THREE.Group();
    this.scene.add(this.auraGroup);
    this.scene.add(this.tileStage);

    this.buildLights();
    this.buildTile();
    this.buildRings();
    this.applyTheme();
    this.bindEvents();
    this.resize();
    this.renderOnce();
    if (!this.reducedMotion.matches) this.start();
  }

  isDarkTheme() {
    const explicit = document.documentElement.dataset.theme;
    if (explicit === 'dark') return true;
    if (explicit === 'light') return false;
    return this.darkQuery.matches;
  }

  buildLights() {
    this.ambient = new THREE.AmbientLight(0xffffff, 1.5);
    this.scene.add(this.ambient);

    this.key = new THREE.DirectionalLight(0xffffff, 2.4);
    this.key.position.set(-4, 6, 11);
    this.scene.add(this.key);

    this.rim = new THREE.PointLight(0x8b6dff, 46, 34, 1.5);
    this.rim.position.set(6, -3, 7);
    this.scene.add(this.rim);

    this.fill = new THREE.PointLight(0x2fa4ff, 34, 34, 1.5);
    this.fill.position.set(-6, 4, 5);
    this.scene.add(this.fill);
  }

  buildTile() {
    this.tileGroup = new THREE.Group();
    this.tileStage.add(this.tileGroup);

    const r = 0.92;
    const h = TILE / 2 - 0.12;
    const shape = new THREE.Shape();
    shape.moveTo(-h + r, -h);
    shape.lineTo(h - r, -h);
    shape.quadraticCurveTo(h, -h, h, -h + r);
    shape.lineTo(h, h - r);
    shape.quadraticCurveTo(h, h, h - r, h);
    shape.lineTo(-h + r, h);
    shape.quadraticCurveTo(-h, h, -h, h - r);
    shape.lineTo(-h, -h + r);
    shape.quadraticCurveTo(-h, -h, -h + r, -h);

    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: 0.44,
      bevelEnabled: true,
      bevelThickness: 0.15,
      bevelSize: 0.12,
      bevelSegments: 6,
      curveSegments: 24,
    });
    geom.translate(0, 0, -0.44);

    const from = new THREE.Color(0x1f94fa);
    const to = new THREE.Color(0x5638e2);
    const pos = geom.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 1) {
      const t = THREE.MathUtils.clamp((pos.getX(i) - pos.getY(i)) / (TILE * 1.1) + 0.5, 0, 1);
      c.copy(from).lerp(to, t);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.tileMaterial = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.24,
      metalness: 0.06,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      emissive: 0x2a56e8,
      emissiveIntensity: 0.65,
    });
    const tile = new THREE.Mesh(geom, this.tileMaterial);
    this.tileGroup.add(tile);

    const plate = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.95, 1.55, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14 }),
    );
    plate.rotation.z = Math.PI / 2;
    plate.scale.set(1, 1, 0.05);
    plate.position.z = 0.15;
    this.tileGroup.add(plate);

    this.bars = BAR_HEIGHTS.map((height, i) => {
      const bar = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.135, 1, 6, 16),
        new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          roughness: 0.18,
          clearcoat: 1,
          emissive: 0xffffff,
          emissiveIntensity: 0.92,
        }),
      );
      bar.position.set((i - 2) * 0.48, 0, 0.34);
      bar.userData.base = height;
      this.tileGroup.add(bar);
      return bar;
    });
  }

  buildRings() {
    const count = window.innerWidth < 700 ? 1200 : 2400;
    const angles = new Float32Array(count);
    const phases = new Float32Array(count);
    const seeds = new Float32Array(count);
    const rings = 8;
    for (let i = 0; i < count; i += 1) {
      angles[i] = Math.random() * Math.PI * 2;
      phases[i] = (Math.floor(Math.random() * rings) + Math.random() * 0.14) / rings;
      seeds[i] = Math.random();
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geom.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1));
    geom.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geom.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    this.ringUniforms = {
      uTime: { value: 0 },
      uEnergy: { value: 1 },
      uPixelRatio: { value: this.renderer.getPixelRatio() },
      uColorA: { value: new THREE.Color(0x2898ff) },
      uColorB: { value: new THREE.Color(0x886bff) },
      uAlpha: { value: 0.85 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms: this.ringUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */`
        attribute float aAngle;
        attribute float aPhase;
        attribute float aSeed;
        uniform float uTime;
        uniform float uEnergy;
        uniform float uPixelRatio;
        varying float vFade;
        varying float vMix;
        void main() {
          float speed = 0.045 + 0.065 * uEnergy;
          float p = fract(aPhase + uTime * speed);
          float radius = 2.8 + p * 11.5;
          float wobble = sin(aAngle * 6.0 + uTime * 1.5 + aSeed * 6.28) * (0.12 + 0.32 * uEnergy) * (1.0 - p);
          vec3 pos = vec3(
            cos(aAngle) * (radius + wobble),
            sin(aAngle) * (radius + wobble) * 0.88,
            (aSeed - 0.5) * 1.1 - p * 1.8
          );
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (2.1 + aSeed * 3.0) * uPixelRatio * (34.0 / -mv.z);
          vFade = smoothstep(0.0, 0.1, p) * pow(1.0 - p, 1.55);
          vMix = 0.5 + 0.5 * sin(aAngle + 0.7);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform float uAlpha;
        uniform float uEnergy;
        varying float vFade;
        varying float vMix;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float soft = smoothstep(0.5, 0.08, d);
          gl_FragColor = vec4(mix(uColorA, uColorB, vMix), soft * vFade * uAlpha * (0.48 + 0.52 * uEnergy));
        }
      `,
    });

    this.rings = new THREE.Points(geom, material);
    this.rings.frustumCulled = false;
    this.rings.rotation.x = -0.16;
    this.auraGroup.add(this.rings);
  }

  applyTheme() {
    const dark = this.isDarkTheme();
    const material = this.rings.material;
    material.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.ringUniforms.uAlpha.value = dark ? 0.96 : 0.68;
    this.ringUniforms.uColorA.value.set(dark ? 0x4db3ff : 0x2578f4);
    this.ringUniforms.uColorB.value.set(dark ? 0xa389ff : 0x6b4df2);
    this.tileMaterial.emissiveIntensity = dark ? 0.88 : 0.58;
    this.rim.intensity = dark ? 64 : 42;
    material.needsUpdate = true;
    this.renderOnce();
  }

  resize() {
    const rect = this.host.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.placeStage(rect);
    this.renderOnce();
  }

  placeStage(hostRect = this.host.getBoundingClientRect()) {
    const dist = this.camera.position.z;
    const worldPerPx = (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * dist) / hostRect.height;

    const frameRect = this.stageFrame.getBoundingClientRect();
    if (frameRect.width && frameRect.height) {
      const fx = frameRect.left + frameRect.width * 0.54 - hostRect.left;
      const fy = frameRect.top + frameRect.height * 0.44 - hostRect.top;
      this.auraGroup.position.set(
        (fx - hostRect.width / 2) * worldPerPx,
        -(fy - hostRect.height / 2) * worldPerPx,
        -2.2,
      );
      const auraScale = (Math.min(frameRect.width, frameRect.height) * 0.44 * worldPerPx) / TILE;
      this.auraGroup.scale.setScalar(Math.max(0.45, auraScale));
    }

    const a = this.anchor.getBoundingClientRect();
    if (!a.width || !a.height) {
      this.tileStage.visible = false;
      return;
    }
    this.tileStage.visible = true;
    const cx = a.left + a.width / 2 - hostRect.left;
    const cy = a.top + a.height / 2 - hostRect.top;
    this.tileStage.position.set(
      (cx - hostRect.width / 2) * worldPerPx,
      -(cy - hostRect.height / 2) * worldPerPx,
      0.8,
    );
    const tilePx = Math.min(a.width, a.height) * 0.86;
    this.tileStage.scale.setScalar((tilePx * worldPerPx) / TILE);
  }

  bindEvents() {
    this.onResize = () => this.resize();
    new ResizeObserver(this.onResize).observe(this.host);
    window.addEventListener('resize', this.onResize);

    window.addEventListener('pointermove', (event) => {
      this.pointerTarget.set(
        (event.clientX / window.innerWidth) * 2 - 1,
        (event.clientY / window.innerHeight) * 2 - 1,
      );
    }, { passive: true });

    document.addEventListener('vh-demo', (event) => {
      this.energyTarget = ENERGY[event.detail] ?? 0.4;
      if (event.detail === 'recognizing') this.sweep = 1;
    });

    this.darkQuery.addEventListener('change', () => this.applyTheme());
    new MutationObserver(() => this.applyTheme()).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    this.reducedMotion.addEventListener('change', () => {
      if (this.reducedMotion.matches) this.stop();
      else this.start();
    });

    new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.updateRunning();
    }).observe(this.host);
    document.addEventListener('visibilitychange', () => this.updateRunning());
  }

  updateRunning() {
    const shouldRun = this.visible && !document.hidden && !this.reducedMotion.matches;
    if (shouldRun) this.start();
    else this.stop();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    const loop = () => {
      if (!this.running) return;
      this.update(Math.min(this.clock.getDelta(), 0.05));
      this.renderer.render(this.scene, this.camera);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    this.energy += (this.energyTarget - this.energy) * Math.min(1, dt * 3);
    this.sweep = Math.max(0, this.sweep - dt * 1.4);
    this.pointer.lerp(this.pointerTarget, Math.min(1, dt * 3));

    this.bars.forEach((bar, i) => {
      const voice = 0.5 + 0.5 * Math.sin(t * 7.3 + i * 1.7) * Math.sin(t * 3.1 + i * 0.9);
      const sweep = this.sweep * Math.max(0, 1 - Math.abs(i - (1 - this.sweep) * 5) / 1.4);
      const k = 0.55 + 0.5 * this.energy * voice + 0.45 * sweep;
      const length = Math.max(0.12, bar.userData.base * 2.3 * k);
      bar.scale.y = length / 1.26;
    });

    this.tileGroup.rotation.y = -0.34 + this.pointer.x * 0.3 + Math.sin(t * 0.65) * 0.06;
    this.tileGroup.rotation.x = 0.14 + this.pointer.y * 0.22 + Math.cos(t * 0.5) * 0.04;
    this.tileGroup.position.y = Math.sin(t * 0.95) * 0.1;

    this.rings.rotation.z = t * 0.028;
    this.ringUniforms.uTime.value = t;
    this.ringUniforms.uEnergy.value = this.energy;
  }

  renderOnce() {
    if (this.running) return;
    this.update(0);
    this.renderer.render(this.scene, this.camera);
  }
}
