/* Film-grain noise over the whole page, redrawn at 10fps.
   Ported from jacoviello.com. Drawn at device resolution with each grain cell
   a whole number of device pixels, so nothing is resampled (no moiré). */
const canvas = document.querySelector("[data-noise]");
const gl = canvas.getContext("webgl", {
  premultipliedAlpha: false,
  antialias: false,
});
const vertexShader = `attribute vec2 p; void main(){gl_Position=vec4(p,0.0,1.0);}`;
const fragmentShader = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float seed;
uniform float cell;
// Dave Hoskins' hash without sine (MIT).
float hash(vec3 p){
  p=fract(p*.1031);
  p+=dot(p,p.zyx+31.32);
  return fract((p.x+p.y)*p.z);
}
void main(){
  float n=hash(vec3(floor(gl_FragCoord.xy/cell),seed));
  gl_FragColor=vec4(vec3(n),1.0);
}`;
const FPS = 10;
function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}
function init() {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexShader));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentShader));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const position = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  return {
    seed: gl.getUniformLocation(program, "seed"),
    cell: gl.getUniformLocation(program, "cell"),
  };
}
const uniforms = gl && init();
if (!uniforms) canvas.remove();
else {
  let frame = 0;
  const render = () => {
    frame = (frame + 1) % 256;
    gl.uniform1f(uniforms.seed, frame);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  // One grain cell per CSS pixel, rounded to whole device pixels.
  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = `${canvas.width / dpr}px`;
    canvas.style.height = `${canvas.height / dpr}px`;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1f(uniforms.cell, Math.max(1, Math.round(dpr)));
    render();
  };
  resize();
  window.addEventListener("resize", resize);
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let last = 0;
    const loop = (now) => {
      if (now - last > 1000 / FPS) {
        render();
        last = now;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
