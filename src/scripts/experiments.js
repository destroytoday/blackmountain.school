import * as THREE from "three";

/* Black Mountain School — eight client-rendered studies.
   Library: Three.js r170 (MIT). Font: Libre Caslon Text Bold (SIL Open Font License 1.1).
   Every page load starts with Infinite Press. Tap or click anywhere for another.
   Scroll to spin the type ring. Drag to draw (see marker.js).
   Keys: Space advances; Enter / R choose another at random; arrows and 1–8
   also select; T cycles the transition style (sweep, iris, dither, fade);
   I inverts; P toggles the image trail (see trail.js).
   All art is generated live. The source image is a visual reference, not a texture. */
const TAU = Math.PI * 2;
const WHITE = "#f8f8f4",
  BLACK = "#000000";
const TEXT = "BLACK MOUNTAIN N.C. / BLACK MOUNTAIN SCHOOL EST 2026 / ";
const stage = document.querySelector("[data-motion-experiments]");
const ink = stage.querySelector("[data-motion-ink]"),
  gpu = stage.querySelector("[data-motion-gpu]"),
  inkCtx = ink.getContext("2d"),
  buffer = document.createElement("canvas"),
  bufferCtx = buffer.getContext("2d");
const HOLD = 3,
  FADE = 1,
  SPIN = TAU / 32,
  KICK = TAU / 6,
  SPIN_LIMIT = TAU * 2,
  TRANSITIONS = ["sweep", "iris", "dither", "fade"],
  SNAPSHOT = -1;
// 8×8 Bayer matrix, tiled over a coarse grid for the dither transition.
const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36,
  14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23,
  61, 29, 53, 21,
];
const GRID = 96;
const mask = document.createElement("canvas");
mask.width = GRID;
mask.height = GRID;
const snapshot = document.createElement("canvas"),
  snapshotCtx = snapshot.getContext("2d");
const maskCtx = mask.getContext("2d"),
  maskData = maskCtx.createImageData(GRID, GRID);
let ctx = inkCtx;
let size = 960,
  current = 0;
let clock = 0,
  ringClock = 0,
  ringAngle = -2.25,
  spinBoost = 0,
  sweepStart = 0,
  transition = 0,
  outgoing = null,
  outgoingClock = 0,
  fadeClock = 0,
  autoplay = false, // Auto-advance through the studies every HOLD seconds.
  previous = performance.now(),
  initialized = false,
  renderer = null,
  glAvailable = false;
let scene, camera, shaderScene, shaderCamera, shaderMat, sculptureA, sculptureB;
let glyphs = [];
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mod = (x, n) => ((x % n) + n) % n;
const smooth = (x) => x * x * (3 - 2 * x);
function circle(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, TAU);
  ctx.fill();
}
function setFont() {
  ctx.font = `700 ${size * 0.054}px Seal, 'Times New Roman', serif`;
  const widths = [...TEXT].map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0),
    spacing = (TAU * size * 0.365 - total) / TEXT.length;
  let offset = 0;
  glyphs = [...TEXT].map((char, i) => {
    const w = widths[i] + spacing;
    const v = { char, angle: (offset + w / 2) / (size * 0.365) };
    offset += w;
    return v;
  });
}
function ringOffset(mode, a, time) {
  if (mode === 2) return Math.sin(a * 3 - (time * TAU) / 8) * size * 0.007;
  if (mode === 1) return Math.sin((time * TAU) / 12) * size * 0.004;
  return 0;
}
function typeRing(time, spin, from = 0, to = from, p = 1) {
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.fillStyle = WHITE;
  ctx.font = `700 ${size * 0.054}px Seal, 'Times New Roman', serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  for (const g of glyphs) {
    const a = g.angle + spin;
    const r =
      size * 0.365 +
      ringOffset(from, a, time) * (1 - p) +
      ringOffset(to, a, time) * p;
    ctx.save();
    ctx.rotate(a);
    ctx.translate(0, -r);
    ctx.fillText(g.char, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}
function aperture(t) {
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate((t * TAU) / 32);
  const R = size * 0.311,
    phase = t / 2 + 3.25,
    n = Math.floor(phase);
  circle(0, 0, R, mod(n - 3, 2) ? WHITE : BLACK);
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.clip();
  for (let k = n - 2; k <= n; k++) {
    const p = clamp((phase - k) / 2),
      r = R * Math.pow(p, 1.12);
    circle(0, 0, r, mod(k, 2) ? WHITE : BLACK);
  }
  ctx.restore();
}
function eccentric(t) {
  const R = size * 0.312;
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate((t * TAU) / 24);
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.clip();
  circle(0, 0, R, WHITE);
  for (let i = 0; i < 10; i++) {
    const r = R * (0.96 - i * 0.088),
      shift = size * 0.0105 * i * Math.sin((t * TAU) / 12);
    circle(
      shift * Math.cos(i * 0.25),
      shift * Math.sin(i * 0.25),
      r,
      i % 2 ? WHITE : BLACK,
    );
  }
  ctx.restore();
}
function elastic(t) {
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate((t * TAU) / 24);
  for (let j = 0; j < 7; j++) {
    const r = size * (0.302 - j * 0.037),
      strength = 0.018 * size * (0.65 + 0.35 * Math.sin((t * TAU) / 8));
    ctx.beginPath();
    for (let i = 0; i <= 320; i++) {
      const a = (i / 320) * TAU,
        rr =
          r +
          strength * Math.sin(3 * a - (t * TAU) / 8 + j * 0.38) +
          size * 0.006 * Math.cos(5 * a + (t * TAU) / 12);
      const x = Math.cos(a) * rr,
        y = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = j % 2 ? BLACK : WHITE;
    ctx.fill();
  }
  ctx.restore();
}
function spiral(t) {
  const R = size * 0.31;
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.clip();
  circle(0, 0, R, WHITE);
  ctx.rotate((-t * TAU) / 12);
  ctx.strokeStyle = BLACK;
  ctx.lineWidth = size * 0.036;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i <= 1400; i++) {
    const a = (i / 1400) * TAU * 5.2,
      r = (a / (TAU * 5.2)) * R * 1.09,
      x = Math.cos(a) * r,
      y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  circle(0, 0, size * 0.014, BLACK);
  ctx.restore();
}
const vertexShader = `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`;
const fragmentShader = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uMode;
uniform float uSize;
const float PI=3.14159265359;
void main(){
  vec2 p=(vUv-.5)*2.;
  float t=uTime;
  float r=length(p),a=atan(p.y,p.x),field=0.;
  float aa=2.2/uSize;
  if(uMode<.5){
    float warp=.040*sin(a*3.+t*.65)*sin(r*7.-t*.8)+.018*cos(a*5.-t*.4);
    float rings=sin((r+warp)*39.-t*2.15);
    field=smoothstep(-.08,.08,rings);
  }else{
    vec2 o=.12*vec2(cos(t*.43),sin(t*.57));
    float r1=length(p-o),r2=length(p+o);
    float f1=sin(85.*r1-t*1.0),f2=sin(85.*r2+t*.65);
    field=smoothstep(-.12,.12,f1*f2);
  }
  float mask=1.-smoothstep(.618-aa,.618+aa,r);
  vec3 color=mix(vec3(0.),vec3(.972549,.972549,.956863),field*mask);
  gl_FragColor=vec4(color,1.);
}`;
function initGPU() {
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: gpu,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(1);
    renderer.setClearColor(BLACK, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(size, size, false);
    shaderScene = new THREE.Scene();
    shaderCamera = new THREE.Camera();
    shaderMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uMode: { value: 0 },
        uSize: { value: size },
      },
    });
    shaderScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), shaderMat));
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1.65, 1.65, 1.65, -1.65, 0.1, 30);
    camera.position.set(0, 0, 7);
    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const key = new THREE.DirectionalLight(0xffffff, 2);
    key.position.set(-3, 4, 7);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 1.2);
    rim.position.set(4, -3, -1);
    scene.add(rim);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.42,
      metalness: 0.15,
      side: THREE.DoubleSide,
    });
    sculptureA = new THREE.Group();
    scene.add(sculptureA);
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(0.91 - i * 0.18, 0.068 - i * 0.006, 20, 160),
        material,
      );
      mesh.userData.i = i;
      sculptureA.add(mesh);
    }
    sculptureB = new THREE.Group();
    scene.add(sculptureB);
    for (let i = 0; i < 11; i++) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.63, 0.96, 160),
        material,
      );
      for (const radius of [0.63, 0.96]) {
        const points = Array.from(
          { length: 160 },
          (_, k) =>
            new THREE.Vector3(
              Math.cos((k / 160) * TAU) * radius,
              Math.sin((k / 160) * TAU) * radius,
              0.001,
            ),
        );
        mesh.add(
          new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineBasicMaterial({ color: 0x050505 }),
          ),
        );
      }
      mesh.userData.i = i;
      sculptureB.add(mesh);
    }
    glAvailable = true;
    gpu.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      glAvailable = false;
      if (current >= 4) select(0);
      if (outgoing >= 4) outgoing = null;
    });
  } catch (error) {
    glAvailable = false;
    console.warn("WebGL fallback", error);
  }
}
function renderGPU(t, mode) {
  if (mode < 6) {
    shaderMat.uniforms.uTime.value = t;
    shaderMat.uniforms.uMode.value = mode - 4;
    renderer.render(shaderScene, shaderCamera);
    return;
  }
  sculptureA.visible = mode === 6;
  sculptureB.visible = mode === 7;
  if (mode === 6) {
    sculptureA.rotation.set(
      0.18 * Math.sin(t * 0.3),
      0.12 * Math.cos(t * 0.2),
      (t * TAU) / 32,
    );
    sculptureA.children.forEach((m, i) => {
      m.rotation.x = Math.sin((t * TAU) / 16 + i * 0.72) * 0.95;
      m.rotation.y = Math.cos((t * TAU) / 16 + i * 0.6) * 0.75;
    });
  } else {
    sculptureB.rotation.set(
      0.76 + Math.sin((t * TAU) / 20) * 0.16,
      0.22 * Math.cos((t * TAU) / 20),
      (t * TAU) / 32,
    );
    sculptureB.children.forEach((m, i) => {
      const p = i / 10;
      m.position.z = (p - 0.5) * 1.0;
      m.position.x = 0.035 * Math.sin(p * TAU - (t * TAU) / 12);
      m.position.y = 0.025 * Math.cos(p * TAU - (t * TAU) / 12);
      const s = 0.76 + 0.19 * Math.sin(p * Math.PI + (t * TAU) / 12);
      m.scale.setScalar(s);
      m.rotation.z = p * 0.2;
    });
  }
  renderer.render(scene, camera);
}
// Draws one study into a 2D context; GPU studies are copied off the WebGL canvas.
// SNAPSHOT is a frozen frame of an interrupted transition.
function drawArt(target, index, t) {
  if (index === SNAPSHOT) {
    if (target !== snapshotCtx) target.drawImage(snapshot, 0, 0);
    return;
  }
  ctx = target;
  ctx.fillStyle = BLACK;
  ctx.fillRect(0, 0, size, size);
  if (index >= 4 && glAvailable) {
    renderGPU(t, index);
    ctx.drawImage(gpu, 0, 0, size, size);
  } else [aperture, eccentric, elastic, spiral][index % 4](t);
  ctx = inkCtx;
}
// Cuts the incoming study in the buffer down to the part revealed at progress p.
function maskIncoming(p) {
  const style = TRANSITIONS[transition];
  if (style === "fade") return p;
  bufferCtx.save();
  bufferCtx.globalCompositeOperation = "destination-in";
  if (style === "iris") {
    const feather = size * 0.02,
      r = p * (size * 0.33 + feather);
    const g = bufferCtx.createRadialGradient(
      size / 2,
      size / 2,
      Math.max(0, r - feather),
      size / 2,
      size / 2,
      Math.max(0.01, r),
    );
    g.addColorStop(0, BLACK);
    g.addColorStop(1, "rgba(0,0,0,0)");
    bufferCtx.fillStyle = g;
    bufferCtx.fillRect(0, 0, size, size);
  } else if (style === "sweep") {
    const start = sweepStart - Math.PI / 2;
    bufferCtx.beginPath();
    bufferCtx.moveTo(size / 2, size / 2);
    bufferCtx.arc(size / 2, size / 2, size, start, start + p * TAU);
    bufferCtx.closePath();
    bufferCtx.fill();
  } else {
    const level = p * 64;
    for (let y = 0; y < GRID; y++)
      for (let x = 0; x < GRID; x++)
        maskData.data[(y * GRID + x) * 4 + 3] =
          BAYER[(y % 8) * 8 + (x % 8)] < level ? 255 : 0;
    maskCtx.putImageData(maskData, 0, 0);
    bufferCtx.imageSmoothingEnabled = false;
    bufferCtx.drawImage(mask, 0, 0, size, size);
  }
  bufferCtx.restore();
  return 1;
}
function render() {
  const p = outgoing === null ? 1 : smooth(clamp(fadeClock / FADE));
  if (p < 1) {
    drawArt(inkCtx, outgoing, outgoingClock);
    drawArt(bufferCtx, current, clock);
    inkCtx.globalAlpha = maskIncoming(p);
    inkCtx.drawImage(buffer, 0, 0);
    inkCtx.globalAlpha = 1;
  } else drawArt(inkCtx, current, clock);
  typeRing(ringClock, ringAngle, outgoing ?? current, current, p);
}
function resize(forced) {
  const rect = stage.querySelector("[data-motion-art]").getBoundingClientRect();
  size =
    forced ||
    Math.min(1600, Math.round(rect.width * Math.min(devicePixelRatio || 1, 2)));
  size = Math.max(64, size);
  ink.width = size;
  ink.height = size;
  buffer.width = size;
  buffer.height = size;
  snapshot.width = size;
  snapshot.height = size;
  if (renderer) {
    renderer.setSize(size, size, false);
    shaderMat.uniforms.uSize.value = size;
  }
  setFont();
  if (initialized) render();
}
function randomIndex(except) {
  const available = glAvailable ? 8 : 4;
  const candidates = Array.from({ length: available }, (_, i) => i).filter(
    (i) => i !== except,
  );
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return candidates[bytes[0] % candidates.length];
}
function select(index) {
  index = mod(index, glAvailable ? 8 : 4);
  if (index === current) return;
  if (outgoing === null) {
    outgoing = current;
    outgoingClock = clock;
  } else {
    // Interrupted mid-transition: freeze the blend so nothing pops.
    drawArt(snapshotCtx, outgoing, outgoingClock);
    drawArt(bufferCtx, current, clock);
    snapshotCtx.globalAlpha = maskIncoming(smooth(clamp(fadeClock / FADE)));
    snapshotCtx.drawImage(buffer, 0, 0);
    snapshotCtx.globalAlpha = 1;
    outgoing = SNAPSHOT;
  }
  fadeClock = 0;
  sweepStart = ringAngle;
  spinBoost = Math.min(SPIN_LIMIT, spinBoost + KICK);
  current = index;
  clock = 0;
  render();
}
function choose(index) {
  autoplay = false;
  select(index);
}
await document.fonts.load("700 50px Seal").catch(() => {});
resize();
initGPU();
gpu.style.visibility = "hidden";
initialized = true;
render();
window.addEventListener("resize", () => resize());
window.visualViewport?.addEventListener("resize", () => resize());
stage.addEventListener("click", () => choose(randomIndex(current)));
window.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === " ") {
    event.preventDefault();
    choose(current + 1);
  }
  if (key === "i") stage.classList.toggle("is-inverted");
  if (key === "enter" || key === "r") {
    event.preventDefault();
    choose(randomIndex(current));
  }
  if (key === "arrowright") choose(current + 1);
  if (key === "arrowleft") choose(current - 1);
  if (/^[1-8]$/.test(key)) choose(Number(key) - 1);
  if (key === "t") {
    transition = mod(transition + 1, TRANSITIONS.length);
    select(current + 1);
  }
});
// Scrolling down spins the ring clockwise, up spins it back.
function spinBy(pixels) {
  spinBoost = clamp(spinBoost + pixels * 0.004, -SPIN_LIMIT, SPIN_LIMIT);
}
window.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    spinBy(event.deltaY * (event.deltaMode === 1 ? 16 : 1));
  },
  { passive: false },
);

function tick(now) {
  const dt = Math.min((now - previous) / 1000, 0.05);
  previous = now;
  if (!document.hidden) {
    clock += dt;
    ringClock += dt;
    ringAngle += (SPIN + spinBoost) * dt;
    spinBoost *= Math.exp(-dt * 2);
    if (outgoing !== null) {
      outgoingClock += dt;
      fadeClock += dt;
      if (fadeClock >= FADE) outgoing = null;
    }
    if (autoplay && clock >= HOLD) select(current + 1);
    render();
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
