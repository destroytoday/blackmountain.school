/* Hand-inked, scanned look for the seal: wobbles lines as if drawn by hand,
   rounds and fills corners, spreads the ink (white here) unevenly so stroke
   weight varies with small bumps and nicks, then re-thresholds to a slightly
   soft scanned edge with a faint, uneven colour fringe like a scan. The
   wobble is fixed to the page, so moving type boils slightly like hand-drawn
   animation. Grain is left to noise.js. Raw WebGL. */
const vertexShader = `attribute vec2 p; void main(){gl_Position=vec4(p,0.0,1.0);}`;
const fragmentShader = `
precision highp float;
uniform sampler2D source;
uniform vec2 res;
const vec3 PAPER=vec3(.972549,.972549,.956863);
// ROUND: corner radius and WARP: line wander, as fractions of the art size.
// SPREAD: ink gain. BUMPS: uneven stroke weight. SOFT: scanned edge softness.
// FRINGE: strength of the scan's colour fringe along edges.
const float ROUND=.0024;
const float WARP=.00035;
const float SPREAD=.07;
const float BUMPS=.11;
const float SOFT=1.6;
const float FRINGE=.4;
const vec3 FRINGE_COLOR=vec3(.86,.88,.58);
// Dave Hoskins' hash without sine (MIT).
float hash(vec2 p){
  vec3 p3=fract(vec3(p.xyx)*.1031);
  p3+=dot(p3,p3.yzx+33.33);
  return fract((p3.x+p3.y)*p3.z);
}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);
  f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
             mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float luma(vec2 uv){return dot(texture2D(source,uv).rgb,vec3(.299,.587,.114));}
void main(){
  vec2 frag=gl_FragCoord.xy;
  float radius=ROUND*res.x;
  // Lines wander a little, as if drawn by hand.
  vec2 w=frag/(res.x*.012);
  vec2 warp=vec2(noise(w)-.5,noise(w+17.3)-.5)*2.*WARP*res.x;
  vec2 uv=(frag+warp)/res;
  // Disk blur: centre plus two rings of eight taps.
  float l=luma(uv)*.2;
  for(int i=0;i<8;i++){
    float a=float(i)*.785398;
    vec2 d=vec2(cos(a),sin(a))*radius/res;
    l+=luma(uv+d)*.05+luma(uv+d*.5+vec2(-d.y,d.x)*.2)*.05;
  }
  // Ink pools unevenly: broad swells in weight plus small bumps and nicks.
  vec2 q=frag/radius;
  float uneven=(noise(q*.18)-.5)*.5+(noise(q*.7)-.5)*.35+(noise(q*1.9)-.5)*.15;
  float threshold=.5-SPREAD+uneven*BUMPS*2.;
  // Slightly soft edge, like a scan of the drawing.
  float width=.6*SOFT/max(radius,1.);
  float tone=smoothstep(threshold-width,threshold+width,l);
  vec3 color=mix(vec3(0.),PAPER,tone);
  // A faint yellow-green fringe hugging the edges, stronger in patches.
  // The blurred luma only sits between 0 and 1 within the blur radius of an
  // edge, so this band is a thin strip along every edge.
  float band=1.-smoothstep(0.,.4,abs(l-threshold+.08));
  band*=step(.002,l)*step(l,.998);
  float patch=smoothstep(.3,.8,noise(q*.12+40.));
  color=mix(color,FRINGE_COLOR*mix(.35,1.,tone),band*patch*FRINGE);
  gl_FragColor=vec4(color,1.);
}`;
export function createXerox(canvas) {
  const gl = canvas.getContext("webgl", { antialias: false });
  if (!gl) return null;
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  };
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
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  for (const [key, value] of [
    [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
    [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
  ])
    gl.texParameteri(gl.TEXTURE_2D, key, value);
  const res = gl.getUniformLocation(program, "res");
  return {
    render(source) {
      if (canvas.width !== source.width || canvas.height !== source.height) {
        canvas.width = source.width;
        canvas.height = source.height;
        gl.viewport(0, 0, canvas.width, canvas.height);
      }
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source,
      );
      gl.uniform2f(res, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
