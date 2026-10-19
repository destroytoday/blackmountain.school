/* Seal: lays the type out glyph by glyph, like typeRing() in experiments.js,
   because <textPath> can't condense individual letters. Scrolling down spins
   it clockwise, scrolling back up turns it back. On load the glyphs fade in
   one by one, clockwise. */
const CONDENSE = 1.09,
  TRACK = 1.4,
  DEG_PER_PX = 0.05,
  // Fade-in of each glyph, and the delay between one glyph and the next
  FADE_MS = 1200,
  STAGGER_MS = 25;
// radius is the baseline. The bottom line is flipped to read upright, so its
// baseline sits one cap height further out to share the top line's band.
// kern adds space (in user units) after the first letter of each pair.
const LINES = [
  {
    text: "BLACK MOUNTAIN SCHOOL",
    radius: 180,
    center: 0,
    flip: false,
    kern: { LA: 4, NT: -2, TA: -2, AI: 4 },
  },
  {
    text: "BLACK MOUNTAIN SCHOOL",
    radius: 214,
    center: 180,
    flip: true,
    kern: { LA: -1, AC: -3, OU: -1, UN: 1, NT: 2, TA: -4 },
  },
];
// Both lines are spaced along the middle of the shared band, so the same text
// spans the same angle top and bottom despite different baselines.
const BAND = LINES.reduce((sum, line) => sum + line.radius, 0) / LINES.length;
const SVG_NS = "http://www.w3.org/2000/svg";

const seal = document.querySelector("[data-seal]");
const group = seal.querySelector("[data-seal-text]");

let rotation = 0,
  lastY = window.scrollY,
  frame = 0;

window.addEventListener(
  "scroll",
  () => {
    rotation += (window.scrollY - lastY) * DEG_PER_PX;
    lastY = window.scrollY;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      seal.style.setProperty("--seal-rotation", `${rotation}deg`);
      frame = 0;
    });
  },
  { passive: true },
);

const style = getComputedStyle(group);
const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
await document.fonts.load(font).catch(() => {});
const ctx = document.createElement("canvas").getContext("2d");
ctx.font = font;

// [{ glyph, angle }], for the fade-in below
const glyphs = [];

for (const { text, radius, center, flip, kern = {} } of LINES) {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width * CONDENSE);
  const gaps = chars.map((c, i) =>
    i < chars.length - 1 ? TRACK + (kern[c + chars[i + 1]] ?? 0) : 0,
  );
  const total = [...widths, ...gaps].reduce((a, b) => a + b, 0);
  // Top runs clockwise; the flipped bottom runs counter-clockwise (left to right).
  const dir = flip ? -1 : 1;
  let offset = -total / 2;
  chars.forEach((char, i) => {
    const angle =
      center + (dir * (offset + widths[i] / 2) * 180) / (Math.PI * BAND);
    offset += widths[i] + gaps[i];
    if (char === " ") return;
    const glyph = document.createElementNS(SVG_NS, "text");
    glyph.textContent = char;
    glyph.setAttribute(
      "transform",
      `translate(250 250) rotate(${angle}) translate(0 ${-radius})${flip ? " rotate(180)" : ""} scale(${CONDENSE} 1)`,
    );
    group.append(glyph);
    glyphs.push({ glyph, angle });
  });
}

// Fades the seal in once its glyphs are laid out in the loaded font
seal.dataset.ready = "";
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const from = glyphs[0].angle;
  const clockwise = ({ angle }) => (((angle - from) % 360) + 360) % 360;
  glyphs
    .sort((a, b) => clockwise(a) - clockwise(b))
    .forEach(({ glyph }, i) => {
      glyph.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: FADE_MS,
        delay: i * STAGGER_MS,
        easing: "cubic-bezier(0.25, 0.1, 0.25, 1)",
        fill: "backwards",
      });
    });
}
