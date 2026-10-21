import * as THREE from 'three';
import type { Frame, Scene } from './scene';

THREE.ColorManagement.enabled = false;

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Glow, slight chromatic aberration, vignette and film grain.
const POST_FRAG = /* glsl */ `
uniform sampler2D tex;
uniform vec2 res;
uniform float seed;
varying vec2 vUv;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32 + seed); return fract(p.x * p.y); }
void main() {
  vec2 uv = vUv;
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  float ca = 0.006 * r2;
  vec3 col = vec3(texture2D(tex, uv + c * ca).r, texture2D(tex, uv).g, texture2D(tex, uv - c * ca).b);
  vec3 glow = vec3(0.0);
  for (int ring = 1; ring <= 3; ring++) {
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7853982 + float(ring) * 0.39;
      vec2 o = vec2(cos(a) * res.y / res.x, sin(a)) * 0.007 * float(ring);
      glow += max(texture2D(tex, uv + o).rgb - 0.55, 0.0) / float(ring);
    }
  }
  col += glow * 0.0;  // off: 24 offset taps left stepped "ghost" halos around bright text (scenes draw their own smooth glow)
  col *= 1.0 - r2 * 0.6;
  col += (hash(floor(uv * res)) - 0.5) * 0.012;  // light grain: heavy grain made the video compress to mush
  gl_FragColor = vec4(col, 1.0);
}`;

const COPY_FRAG = /* glsl */ `
uniform sampler2D tex;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(tex, vUv); }`;

function layer(w: number, h: number, scale: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const scene = new THREE.Scene();
  scene.add(
    new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: { tex: { value: tex } },
        vertexShader: QUAD_VERT,
        fragmentShader: COPY_FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    ),
  );
  return {
    ctx,
    tex,
    scene,
    begin() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    },
  };
}

/** Composites a plate's bg layer, 3D scene and fg layer, then applies the post pass. */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  private bg;
  private fg;
  private rt: THREE.WebGLRenderTarget;
  private post = new THREE.Scene();
  private postMat: THREE.ShaderMaterial;
  private quadCam = new THREE.Camera();
  private inited = new WeakSet<Scene>();

  constructor(canvas: HTMLCanvasElement, readonly w: number, readonly h: number, scale: number) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.autoClear = false;
    this.bg = layer(w, h, scale);
    this.fg = layer(w, h, scale);
    this.rt = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
    this.postMat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: this.rt.texture }, res: { value: new THREE.Vector2(w, h) }, seed: { value: 0 } },
      vertexShader: QUAD_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.post.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));
  }

  render(scene: Scene, f: Frame) {
    const r = this.renderer;
    this.bg.begin();
    this.fg.begin();
    scene.render(f, { bg: this.bg.ctx, fg: this.fg.ctx });
    this.bg.tex.needsUpdate = true;
    this.fg.tex.needsUpdate = true;

    r.setRenderTarget(this.rt);
    r.setClearColor(0x14110e, 1);
    r.clear();
    r.render(this.bg.scene, this.quadCam);
    if (scene.uses3D) {
      if (scene.init3D && !this.inited.has(scene)) {
        this.inited.add(scene);
        scene.init3D(r);
      }
      scene.camera.aspect = this.w / this.h;
      scene.camera.updateProjectionMatrix();
      r.clearDepth();
      r.render(scene.three, scene.camera);
    }
    r.render(this.fg.scene, this.quadCam);

    r.setRenderTarget(null);
    this.postMat.uniforms.seed.value = (Math.floor(f.t * 60 + 1e-6) % 997) * 0.173;
    r.render(this.post, this.quadCam);
  }

  /** RGBA pixels of the last frame (bottom row first, as WebGL returns them). */
  readPixels(into: Uint8Array) {
    const gl = this.renderer.getContext();
    gl.readPixels(0, 0, this.w, this.h, gl.RGBA, gl.UNSIGNED_BYTE, into);
    return into;
  }
}
