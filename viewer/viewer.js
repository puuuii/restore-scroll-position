// 自前 PDF ビューア(pdf.js)。ローカルファイル(file://)のPDFのスクロール位置を記憶・復元する。
import * as pdfjsLib from '../vendor/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdf.worker.min.mjs');

const SRC = new URLSearchParams(location.search).get('src') || '';
const MEM_KEY = 'pdf:' + SRC;
const pagesEl = document.getElementById('pages');
const errorEl = document.getElementById('error');
const titleEl = document.getElementById('doc-title');

let doc = null;
let scale = 1;
let states = []; // { page, el, canvas, ctx, task, renderedAtScale }
let cumHeights = []; // pages[i] の上端からの累積高 (CSS px)

function showErr(message, originalUrl) {
  errorEl.hidden = false;
  errorEl.textContent = message + ' ';
  if (originalUrl) {
    const a = document.createElement('a');
    a.href = originalUrl;
    a.textContent = '元 URL を開く';
    errorEl.appendChild(a);
  }
}

async function main() {
  if (!SRC) return showErr('PDF のURLが指定されていません。');
  titleEl.textContent = decodeURIComponent(SRC.split('/').pop()) || 'PDF';

  let data;
  try {
    const res = await fetch(SRC);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.arrayBuffer();
  } catch (e) {
    return showErr(`PDF を読み込めませんでした: ${e.message}`, SRC);
  }

  try {
    doc = await pdfjsLib.getDocument({ data }).promise;
  } catch (e) {
    return showErr(`PDF の解析に失敗しました: ${e.message}`, SRC);
  }

  buildPages();
  await loadAllViewports();
  const saved = await ScrollMemory.get(MEM_KEY);
  setScale(saved && typeof saved.scale === 'number' ? saved.scale : fitWidth());
  if (saved) scrollToPage(saved.page, saved.off);

  startScrollSave();
}

function buildPages() {
  for (let i = 1; i <= doc.numPages; i++) {
    const el = document.createElement('div');
    el.className = 'page';
    el.dataset.page = String(i);
    const canvas = document.createElement('canvas');
    el.appendChild(canvas);
    pagesEl.appendChild(el);
    states.push({
      page: null, // PDFPagePromise は非同期で取得
      el,
      canvas,
      ctx: canvas.getContext('2d'),
      task: null,
      renderedAtScale: null,
    });
  }
}

// ページの寸法(縮尺1)を取得してプレースホルダの高さを確保する
async function loadAllViewports() {
  for (let i = 0; i < states.length; i++) {
    const s = states[i];
    s.page = await doc.getPage(i + 1);
  }
  applyHeights();
}

function applyHeights() {
  cumHeights = [0];
  for (let i = 0; i < states.length; i++) {
    const h = states[i].page.getViewport({ scale }).height;
    states[i].el.style.height = `${h}px`;
    cumHeights.push(cumHeights[i] + h);
  }
}

function fitWidth() {
  const w = window.innerWidth - 48;
  const pageW = states[0].page.getViewport({ scale: 1 }).width;
  return Math.min(3, Math.max(0.4, w / pageW));
}

function setScale(newScale) {
  scale = newScale;
  for (const s of states) {
    s.renderedAtScale = null;
    if (s.task) { try { s.task.cancel(); } catch {} s.task = null; }
  }
  applyHeights();
}

function pageTop(i) { return cumHeights[i]; }

function scrollToPage(page, off) {
  const max = window.document.documentElement.scrollHeight - window.innerHeight;
  window.scrollTo(0, Math.max(0, Math.min(max, pageTop(page) - off)));
}

// ---- レンダリング(表示範囲のみ、遅延実行) ----
async function renderPage(i) {
  const s = states[i];
  if (s.renderedAtScale === scale || s.task) return;
  const dpr = window.devicePixelRatio || 1;
  const vp = s.page.getViewport({ scale });
  s.canvas.style.width = `${vp.width}px`;
  s.canvas.style.height = `${vp.height}px`;
  s.canvas.width = Math.max(1, Math.floor(vp.width * dpr));
  s.canvas.height = Math.max(1, Math.floor(vp.height * dpr));
  const ctx = s.ctx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  s.task = s.page.render({ canvasContext: ctx, viewport: vp });
  try {
    await s.task.promise;
    s.renderedAtScale = scale;
  } catch (e) {
    if (e?.name === 'RenderingCancelledException') return; // 縮小/再描画による中断
    console.warn(`Page ${i + 1} render failed:`, e);
  } finally {
    s.task = null;
  }
}

const io = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) renderPage(entry.target.dataset.page);
    }
  },
  { rootMargin: '600px' }
);

function observePages() {
  for (const s of states) io.observe(s.el);
}

// ---- スクロール位置の保存 ----
function topPageIndex(y) {
  let lo = 0, hi = states.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pageTop(mid) <= y) lo = mid; else hi = mid - 1;
  }
  return lo;
}

function currentPosition() {
  const y = window.scrollY;
  const page = topPageIndex(y);
  return { page, off: y - pageTop(page), scale };
}

let saveTimer = null;
function startScrollSave() {
  const saveNow = () => ScrollMemory.save(MEM_KEY, currentPosition());
  window.addEventListener('scroll', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }, { passive: true });
  window.addEventListener('pagehide', () => { clearTimeout(saveTimer); saveNow(); });
}

// ---- ズームUI ----
function zoom(factor) {
  const pos = currentPosition();
  setScale(Math.min(4, Math.max(0.3, scale * factor)));
  scrollToPage(pos.page, pos.off);
}
document.getElementById('zoom-in').addEventListener('click', () => zoom(1.25));
document.getElementById('zoom-out').addEventListener('click', () => zoom(0.8));
document.getElementById('zoom-fit').addEventListener('click', () => {
  const pos = currentPosition();
  setScale(fitWidth());
  scrollToPage(pos.page, pos.off);
});

main().then(observePages).catch(console.error);
