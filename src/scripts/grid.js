/* Photo grid: the photo stack is drawn on one fixed canvas. Each frame is a
   full screen of scroll: it scrolls in from below, holds at the top (as if
   sticky) while later frames stack over it, and its photo fades out over
   FADE_SCREENS screens. Frames are plain data, so the stack never adds DOM:
   placing another batch just makes the scroll track taller.
   Each photo gets a random column span and start. Rows only place the photo;
   its height follows its aspect ratio, and the start row is limited so it
   still fits on screen. The first sits in the top row so it peeks in at the
   bottom, and is at least FIRST_MIN_COLS wide. Photos are dealt from a
   shuffled deck, reshuffled once it runs out, so each shows once per cycle. */
const MIN_SPAN = 3,
  MAX_SPAN = 6,
  FIRST_MIN_COLS = 4,
  // Frames placed at a time, kept a few ahead of the screen
  BATCH_SIZE = 6,
  FADE_SCREENS = 3,
  // Photos loaded this many frames ahead of (and behind) the screen
  PRELOAD_FRAMES = 2,
  // Decoded photos kept in memory; the least recently drawn are released
  MAX_CACHED = 16,
  // Higher pixel densities cost memory without visibly sharper photos
  MAX_DPR = 2;
const randomInt = (min, max) =>
  min + Math.floor(Math.random() * (max - min + 1));

const canvas = document.querySelector("[data-canvas]");
const ctx = canvas.getContext("2d");
const container = document.querySelector("[data-frames]");
const track = container.querySelector("[data-track]");
// [{ width, height, sources: [{ url, width }] }], sources smallest first
const photos = JSON.parse(container.dataset.photos);
// Grid size comes from CSS (--grid): 12 on desktop, 6 on mobile
const gridSize = () =>
  parseInt(getComputedStyle(container).getPropertyValue("--grid"));

// [{ photo, column, cols, row }]
const placements = [];
// Start column and row of the previous photo, across batches, so neither
// repeats back to back
let lastColumn = 0,
  lastRow = 0;
// Photos not yet dealt this cycle
let deck = [];
// Random start from 1 to max, excluding last, by drawing one fewer and
// skipping over it. With a single possible start (a full-width or
// full-height photo), that start is used even if it repeats.
function randomStart(max, last) {
  const skip = max > 1 && last >= 1 && last <= max;
  const start = randomInt(1, skip ? max - 1 : max);
  return skip && start >= last ? start + 1 : start;
}

// Next photo from the deck, refilled with a fresh Fisher–Yates shuffle when
// empty
function deal() {
  if (!deck.length) {
    deck = [...photos];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = randomInt(0, i);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }
  return deck.pop();
}

// Places another batch and grows the scroll track to fit it
function placeBatch() {
  const grid = gridSize();
  for (let n = 0; n < BATCH_SIZE; n++) {
    const photo = deal();
    const lead = placements.length === 0;
    const cols = randomInt(lead ? FIRST_MIN_COLS : MIN_SPAN, MAX_SPAN);
    // Rows the photo covers at this width, from its aspect ratio
    const ratio = photo.width / photo.height;
    const rows = Math.ceil(
      (cols * window.innerWidth) / (ratio * window.innerHeight),
    );
    const column = randomStart(grid + 1 - cols, lastColumn);
    const row = lead ? 1 : randomStart(Math.max(1, grid + 1 - rows), lastRow);
    lastColumn = column;
    lastRow = row;
    placements.push({ photo, column, cols, row });
  }
  track.style.setProperty("--count", `${placements.length}`);
}

// Decoded photos by URL. Map order doubles as least-recently-used order: each
// use moves a photo to the end, and the oldest are released past MAX_CACHED
// so the browser can free them.
const cache = new Map();

function use(url) {
  let entry = cache.get(url);
  if (entry) {
    cache.delete(url);
  } else {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    entry = { img, ready: false };
    const loaded = entry;
    img
      .decode()
      .then(() => {
        loaded.ready = true;
        requestDraw();
      })
      .catch(() => {});
  }
  cache.set(url, entry);
  for (const [oldUrl, old] of cache) {
    if (cache.size <= MAX_CACHED) break;
    old.img.src = "";
    cache.delete(oldUrl);
  }
  return entry;
}

// Smallest source that covers the drawn width at the screen's density
function sourceFor(photo, width, dpr) {
  const needed = width * dpr;
  return (
    photo.sources.find((source) => source.width >= needed) ??
    photo.sources[photo.sources.length - 1]
  ).url;
}

let drawFrame = 0;
const requestDraw = () => (drawFrame ||= requestAnimationFrame(draw));

function draw() {
  drawFrame = 0;
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const width = window.innerWidth,
    height = window.innerHeight;
  if (canvas.width !== Math.round(width * dpr)) {
    canvas.width = Math.round(width * dpr);
  }
  if (canvas.height !== Math.round(height * dpr)) {
    canvas.height = Math.round(height * dpr);
  }

  const y = window.scrollY;
  // Frame i sticks once scrolled to start + i × step, as if each frame were a
  // full-screen (100svh) sticky element in the track
  const start = track.getBoundingClientRect().top + y;
  const step = track.offsetHeight / placements.length;
  const distance = FADE_SCREENS * height;

  // On screen: from the oldest frame still fading to the newest scrolled in.
  // Older frames have fully faded, and their backings match the page.
  const first = Math.max(0, Math.floor((y - start - distance) / step) + 1);
  const last = Math.ceil((y + height - start) / step) - 1;
  // Keep a batch ahead so there's always more to scroll to
  if (last + PRELOAD_FRAMES >= placements.length - BATCH_SIZE) {
    placeBatch();
    requestDraw();
  }

  const grid = gridSize();
  const column = width / grid,
    row = step / grid;
  const background = getComputedStyle(document.body).backgroundColor;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  for (let i = first; i <= last; i++) {
    const placement = placements[i];
    if (!placement) break;
    const { photo, cols } = placement;
    const stick = start + i * step;
    const x = (placement.column - 1) * column;
    const top = Math.max(0, stick - y) + (placement.row - 1) * row;
    const w = cols * column,
      h = (w * photo.height) / photo.width;
    // Only the photo fades; its backing stays opaque so it fades to the
    // background instead of mixing with the photos stacked beneath
    ctx.globalAlpha = 1;
    ctx.fillStyle = background;
    ctx.fillRect(x, top, w, h);
    const { img, ready } = use(sourceFor(photo, w, dpr));
    if (ready) {
      ctx.globalAlpha = Math.min(1, Math.max(0, 1 - (y - stick) / distance));
      ctx.drawImage(img, x, top, w, h);
    }
  }

  // Start loading the photos just off screen in both directions
  const preload = [
    ...placements.slice(last + 1, last + 1 + PRELOAD_FRAMES),
    ...placements.slice(Math.max(0, first - PRELOAD_FRAMES), first),
  ];
  for (const { photo, cols } of preload) {
    use(sourceFor(photo, cols * column, dpr));
  }
}

placeBatch();
window.addEventListener("scroll", requestDraw, { passive: true });
window.addEventListener("resize", requestDraw);
draw();
