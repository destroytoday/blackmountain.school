/* Image trail: P toggles. Moving the pointer drops Black Mountain College
   photos every SPACING px; they stack and fade after LIFE ms. Photos cycle
   in a shuffled order so each shows once before any repeats. */
const SPACING = 90,
  LIFE = 1100,
  MAX = 16,
  JUMP = 300;
const pool = [];
const layer = document.querySelector("[data-trail]");
const photos = JSON.parse(layer.dataset.trail);
let enabled = false,
  last = null,
  order = [],
  slot = 0,
  preloaded = false;
function shuffle() {
  order = photos.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
}
function next() {
  if (!order.length) shuffle();
  return photos[order.pop()];
}
// Reuses a fixed pool of <img> elements; the newest is moved to the top.
function spawn(x, y) {
  const photo = next();
  let img = pool[slot];
  if (!img) {
    img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    pool[slot] = img;
  }
  slot = (slot + 1) % MAX;
  img.getAnimations().forEach((a) => a.cancel());
  img.src = photo.src;
  const width =
    img.offsetWidth || Math.min(280, Math.max(140, innerHeight * 0.22));
  const height = width / photo.ratio;
  const at = `translate(${x - width / 2}px, ${y - height / 2}px)`;
  layer.append(img);
  img.animate(
    [
      { opacity: 1, transform: `${at} scale(0.9)` },
      { opacity: 1, transform: `${at} scale(1)`, offset: 0.12 },
      { opacity: 1, transform: `${at} scale(1)`, offset: 0.7 },
      { opacity: 0, transform: `${at} scale(0.96)` },
    ],
    { duration: LIFE, easing: "ease-out", fill: "forwards" },
  );
}
function preload() {
  if (preloaded) return;
  preloaded = true;
  for (const photo of photos) new Image().src = photo.src;
}
window.addEventListener("pointermove", (event) => {
  if (!enabled || event.pointerType === "touch") return;
  const { clientX: x, clientY: y } = event;
  if (!last || Math.hypot(x - last.x, y - last.y) > JUMP) {
    last = { x, y };
    spawn(x, y);
    return;
  }
  // Lay photos down at even spacing so fast moves don't leave gaps.
  const dx = x - last.x,
    dy = y - last.y,
    dist = Math.hypot(dx, dy);
  for (let i = 1; i <= Math.floor(dist / SPACING); i++) {
    last = {
      x: last.x + (dx / dist) * SPACING,
      y: last.y + (dy / dist) * SPACING,
    };
    spawn(last.x, last.y);
  }
});
document.addEventListener("mouseleave", () => (last = null));
window.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key.toLowerCase() !== "p") return;
  enabled = !enabled;
  last = null;
  if (enabled) preload();
  else for (const img of pool) img.getAnimations().forEach((a) => a.cancel());
});
