/* Marker: drag anywhere to draw, C clears. A tap without dragging still
   falls through to the stage's click (choose another study). The layer
   blends with difference, so marks read against both black and white. */
const COLOR = "#f8f8f4",
  WIDTH = 6,
  THRESHOLD = 4;
const stage = document.querySelector("[data-motion-experiments]");
const canvas = stage.querySelector("[data-marker]"),
  ctx = canvas.getContext("2d");
let stroke = null,
  drew = false;
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const width = Math.round(innerWidth * dpr),
    height = Math.round(innerHeight * dpr);
  if (canvas.width === width && canvas.height === height) return;
  if (!width || !height) return;
  // Keep existing marks across resizes.
  const old = document.createElement("canvas");
  old.width = canvas.width;
  old.height = canvas.height;
  old.getContext("2d").drawImage(canvas, 0, 0);
  canvas.width = width;
  canvas.height = height;
  if (old.width && old.height) ctx.drawImage(old, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = COLOR;
}
const lineWidth = (event) =>
  WIDTH * (event.pointerType === "pen" ? 0.4 + event.pressure * 1.2 : 1);
// Smooths the path with quadratic curves through segment midpoints.
function extend(event) {
  const point = { x: event.clientX, y: event.clientY };
  const mid = {
    x: (stroke.last.x + point.x) / 2,
    y: (stroke.last.y + point.y) / 2,
  };
  ctx.lineWidth = lineWidth(event);
  ctx.beginPath();
  ctx.moveTo(stroke.mid.x, stroke.mid.y);
  ctx.quadraticCurveTo(stroke.last.x, stroke.last.y, mid.x, mid.y);
  ctx.stroke();
  stroke.last = point;
  stroke.mid = mid;
}
stage.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const start = { x: event.clientX, y: event.clientY };
  stroke = { start, last: start, mid: start, active: false };
  drew = false;
  stage.setPointerCapture(event.pointerId);
});
stage.addEventListener("pointermove", (event) => {
  if (!stroke) return;
  for (const e of event.getCoalescedEvents?.() ?? [event]) {
    if (!stroke.active) {
      const dx = e.clientX - stroke.start.x,
        dy = e.clientY - stroke.start.y;
      if (Math.hypot(dx, dy) < THRESHOLD) continue;
      stroke.active = true;
    }
    extend(e);
  }
});
function end(event) {
  if (!stroke) return;
  if (stroke.active) {
    ctx.lineWidth = lineWidth(event);
    ctx.beginPath();
    ctx.moveTo(stroke.mid.x, stroke.mid.y);
    ctx.lineTo(event.clientX, event.clientY);
    ctx.stroke();
    drew = true;
  }
  stroke = null;
}
stage.addEventListener("pointerup", end);
stage.addEventListener("pointercancel", end);
// A drag shouldn't also count as a tap.
window.addEventListener(
  "click",
  (event) => {
    if (!drew) return;
    drew = false;
    event.stopImmediatePropagation();
  },
  true,
);
window.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key.toLowerCase() === "c")
    ctx.clearRect(0, 0, innerWidth, innerHeight);
});
resize();
window.addEventListener("resize", resize);
