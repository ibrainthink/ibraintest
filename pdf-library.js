import { app, auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { getStorage, ref, list, getDownloadURL, getBytes } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js';
import { DOMAINS, classifyFilename } from './pdf-catalog.js';

/* PDF.js는 맨 위에서 import하지 않고, 필요할 때 안전하게 불러옵니다.
   (CDN 로딩에 실패해도 로그인과 PDF 목록은 정상 작동합니다.) */
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
let pdfjsPromise = null;
function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(PDFJS_URL).then(lib => {
      lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      return lib;
    }).catch(e => {
      pdfjsPromise = null;
      throw e;
    });
  }
  return pdfjsPromise;
}

const storage = getStorage(app);
const $ = id => document.getElementById(id);
let catalog = [], groups = [], selectedFiles = [], approved = false, generation = 0;
let fontLevel = Number(localStorage.getItem('iBrainFontLevel') || 0);
let activeFile = null, activeUrl = '', renderToken = 0;
const pdfCache = new Map();

const option = (s, v, l) => {
  const o = document.createElement('option');
  o.value = v;
  o.textContent = l;
  s.append(o);
};
const status = t => { $('status').textContent = t; };

/* ---------- 글씨 크기 ---------- */
function applyFont() {
  fontLevel = Math.max(-2, Math.min(5, fontLevel));
  const n = 1 + fontLevel * 0.1;
  document.documentElement.style.setProperty('--library-scale', n);
  $('fontLabel').textContent = Math.round(n * 100) + '%';
  localStorage.setItem('iBrainFontLevel', fontLevel);
}
$('fontDown').onclick = () => { fontLevel--; applyFont(); };
$('fontUp').onclick = () => { fontLevel++; applyFont(); };
applyFont();

/* ---------- 공통 ---------- */
function err(e) {
  console.error(e);
  if (e && e.code === 'storage/unauthorized') return '자료 접근 권한이 없습니다. Storage 규칙을 확인해 주세요.';
  return 'PDF를 불러오지 못했습니다. 다시 시도해 주세요.';
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const starsText = s => (s === 'unknown' ? '미분류' : '★'.repeat(Number(s) || 0));

/* ---------- PDF 목록 읽기 ---------- */
async function scan(folder, out, run) {
  let token;
  do {
    const page = await list(folder, { maxResults: 100, ...(token ? { pageToken: token } : {}) });
    if (run !== generation) return;
    page.items
      .filter(x => /\.pdf$/i.test(x.name))
      .forEach(x => out.push({ ref: x, name: x.name, ...classifyFilename(x.name) }));
    for (const p of page.prefixes) await scan(p, out, run);
    token = page.nextPageToken;
  } while (token && run === generation);
}

/* ---------- 선택 상자 ---------- */
function fillStars() {
  const d = $('domain').value, s = $('stars');
  s.replaceChildren();
  option(s, '', '난이도 선택');
  $('qty').replaceChildren();
  option($('qty'), '', '개수 선택');
  $('qty').disabled = true;
  $('addSet').disabled = true;
  if (!d) { s.disabled = true; return; }
  const levels = [...new Set(catalog.filter(f => f.domain === d).map(f => f.stars ?? 'unknown'))]
    .sort((a, b) => a === 'unknown' ? 1 : b === 'unknown' ? -1 : a - b);
  levels.forEach(n => option(s, String(n), n === 'unknown' ? '난이도 미분류' : '★'.repeat(Number(n))));
  s.disabled = false;
}
function fillQty() {
  const d = $('domain').value, s = $('stars').value, q = $('qty');
  q.replaceChildren();
  option(q, '', '개수 선택');
  if (!d || !s) { q.disabled = true; return; }
  const n = catalog.filter(f => f.domain === d && String(f.stars ?? 'unknown') === s).length;
  for (let i = 1; i <= Math.min(20, n); i++) option(q, i, i + '개');
  q.disabled = !n;
  $('addSet').disabled = true;
}
$('qty').onchange = () => { $('addSet').disabled = !$('qty').value; };

function rebuild() {
  const used = new Set();
  selectedFiles = [];
  groups.forEach(g => {
    const p = shuffle(catalog.filter(f => f.domain === g.domain && String(f.stars ?? 'unknown') === g.stars && !used.has(f.name))).slice(0, g.count);
    p.forEach(f => { used.add(f.name); selectedFiles.push(f); });
    g.actual = p.length;
  });
  render();
}

/* ---------- PDF 미리보기 (PDF.js, canvas) ---------- */
/* Storage 주소를 PDF.js가 직접 읽지 않고, Firebase SDK가 바이트를 가져옵니다. */
async function loadPdf(file) {
  const key = file.ref.fullPath;
  if (pdfCache.has(key)) return pdfCache.get(key);
  let stage = 'PDF.js 불러오기';
  try {
    const lib = await getPdfjs();
    stage = '파일 읽기(CORS)';
    const bytes = await getBytes(file.ref, 25 * 1024 * 1024);
    stage = 'PDF 해석';
    const pdf = await lib.getDocument({ data: new Uint8Array(bytes) }).promise;
    pdfCache.set(key, pdf);
    return pdf;
  } catch (e) {
    e.stage = stage;
    throw e;
  }
}
function errBrief(e) {
  const m = String((e && (e.code || e.message)) || e).slice(0, 60);
  return '[' + ((e && e.stage) || '그리기') + '] ' + m;
}

async function draw(pdf, canvas, width) {
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.max(0.2, width / base.width);
  const vp = page.getViewport({ scale });
  const r = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(vp.width * r);
  canvas.height = Math.floor(vp.height * r);
  canvas.style.width = Math.floor(vp.width) + 'px';
  canvas.style.height = Math.floor(vp.height) + 'px';
  await page.render({
    canvasContext: canvas.getContext('2d'),
    viewport: vp,
    transform: r === 1 ? null : [r, 0, 0, r, 0, 0]
  }).promise;
}

/* 썸네일을 한 번에 너무 많이 만들지 않도록 3개씩 처리 */
const thumbQueue = [];
let thumbRunning = 0;
function enqueueThumb(job) {
  thumbQueue.push(job);
  pumpThumbs();
}
function pumpThumbs() {
  while (thumbRunning < 3 && thumbQueue.length) {
    const job = thumbQueue.shift();
    thumbRunning++;
    job().catch(e => console.error(e)).finally(() => { thumbRunning--; pumpThumbs(); });
  }
}

async function makeThumb(file, canvas, label, token) {
  if (token !== renderToken) return;
  try {
    label.textContent = '미리보기 불러오는 중…';
    const pdf = await loadPdf(file);
    if (token !== renderToken) return;
    const wrap = canvas.parentElement;
    await draw(pdf, canvas, Math.max(110, (wrap.clientWidth || 170) - 2));
    label.hidden = true;
    canvas.dataset.ok = '1';
  } catch (e) {
    console.error(e);
    label.hidden = false;
    label.textContent = '실패 ' + errBrief(e) + ' · 눌러서 다시 시도';
    canvas.dataset.ok = '';
  }
}

async function showFile(file, card) {
  document.querySelectorAll('.pdf-thumb-card').forEach(x => x.classList.remove('active'));
  if (card) card.classList.add('active');
  $('selected').textContent = file.name;
  $('largePreviewName').textContent = file.name;
  $('largePreview').hidden = false;
  try {
    status('큰 미리보기 불러오는 중…');
    activeFile = file;
    activeUrl = await getDownloadURL(file.ref);
    $('open').disabled = false;
    const pdf = await loadPdf(file);
    await draw(pdf, $('largeCanvas'), Math.min(760, Math.max(280, $('largePreview').clientWidth - 28)));
    status('미리보기 준비 완료');
    $('largePreview').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    /* 미리보기가 실패해도 "새 창에서 열기"는 사용할 수 있습니다. */
    status('미리보기 실패 ' + errBrief(e) + ' · "새 창에서 열기"로 확인해 주세요.');
    console.error(e);
  }
}

function render() {
  const token = ++renderToken;
  thumbQueue.length = 0;

  const b = $('bundle');
  b.replaceChildren();
  $('totalCount').textContent = '총 ' + selectedFiles.length + '개';
  if (!groups.length) {
    b.innerHTML = '<p class="empty">위에서 영역·난이도·개수를 선택해 추가하세요.</p>';
  } else {
    groups.forEach(g => {
      const x = document.createElement('div');
      x.className = 'bundle-chip';
      x.append(document.createTextNode(g.domain + ' · ' + starsText(g.stars) + ' · ' + (g.actual ?? g.count) + '개'));
      const z = document.createElement('button');
      z.textContent = '×';
      z.onclick = () => { groups = groups.filter(v => v !== g); rebuild(); };
      x.append(z);
      b.append(x);
    });
  }

  const off = !groups.length;
  $('clearBundle').disabled = off;
  $('reroll').disabled = off;
  $('makePreview').disabled = off;
  $('print').disabled = !selectedFiles.length;
  $('open').disabled = true;
  $('largePreview').hidden = true;
  activeFile = null;
  activeUrl = '';

  const p = $('previewList');
  p.replaceChildren();
  if (!selectedFiles.length) {
    p.innerHTML = '<p class="empty">아직 선택된 문제가 없습니다.</p>';
    return;
  }
  selectedFiles.forEach((f, i) => {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'pdf-thumb-card';
    c.innerHTML = '<div class="thumb-canvas-wrap"><canvas></canvas><div class="thumb-loading">미리보기 대기 중…</div></div>' +
      '<div class="thumb-name">' + (i + 1) + '. ' + escapeHtml(f.name) + '</div>';
    const canvas = c.querySelector('canvas');
    const label = c.querySelector('.thumb-loading');
    c.onclick = () => {
      if (!canvas.dataset.ok) enqueueThumb(() => makeThumb(f, canvas, label, renderToken));
      showFile(f, c);
    };
    p.append(c);
    enqueueThumb(() => makeThumb(f, canvas, label, token));
  });
}

/* ---------- 전체 인쇄 (PDF 합치기) ---------- */
async function printAll() {
  if (!selectedFiles.length) return;
  status('인쇄용 PDF를 합치는 중…');
  try {
    if (!window.PDFLib) throw new Error('PDFLib missing');
    const merged = await PDFLib.PDFDocument.create();
    for (const f of selectedFiles) {
      const bytes = await getBytes(f.ref, 25 * 1024 * 1024);
      const src = await PDFLib.PDFDocument.load(bytes);
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach(pg => merged.addPage(pg));
    }
    const blob = new Blob([await merged.save()], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) location.href = url;
    status('선택한 문제를 한 파일로 만들었습니다. 열린 PDF에서 인쇄하세요.');
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  } catch (e) {
    status('한 파일로 합치지 못했습니다. 새 창에서 개별 PDF를 열어 인쇄해 주세요.');
    console.error(e);
  }
}

/* ---------- 목록 불러오기 ---------- */
async function reload() {
  if (!approved) return;
  const run = ++generation;
  $('reload').disabled = true;
  status('PDF 목록을 불러오는 중…');
  try {
    const found = [];
    await scan(ref(storage, 'evaluation-pdfs'), found, run);
    if (run !== generation) return;
    catalog = found.sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }));
    const d = $('domain');
    d.replaceChildren();
    option(d, '', '영역 선택');
    [...DOMAINS.map(x => x.label), '미분류']
      .filter(x => catalog.some(f => f.domain === x))
      .forEach(x => option(d, x, x));
    d.disabled = false;
    fillStars();
    status('PDF ' + catalog.length + '개 불러옴');
  } catch (e) {
    status(err(e));
  } finally {
    $('reload').disabled = false;
  }
}

/* ---------- 버튼 연결 ---------- */
$('domain').onchange = fillStars;
$('stars').onchange = fillQty;
$('addSet').onclick = () => {
  const d = $('domain').value, s = $('stars').value, n = Number($('qty').value);
  if (d && s && n) {
    groups.push({ domain: d, stars: s, count: n });
    rebuild();
    status('선택 완료 · 총 ' + selectedFiles.length + '개');
  }
};
$('clearBundle').onclick = () => { groups = []; selectedFiles = []; rebuild(); status('모두 비웠습니다.'); };
$('reroll').onclick = () => { rebuild(); status('다시 뽑았습니다.'); };
$('makePreview').onclick = () => {
  $('previewList').scrollIntoView({ behavior: 'smooth' });
  status('작은 미리보기를 누르면 크게 볼 수 있습니다.');
};
$('closeLarge').onclick = () => { $('largePreview').hidden = true; };
$('open').onclick = () => { if (activeUrl) window.open(activeUrl, '_blank', 'noopener'); };
$('print').onclick = printAll;
$('reload').onclick = reload;
$('logoutBtn').onclick = () => signOut(auth).then(() => { location.href = 'index.html'; });

/* ---------- 로그인 확인 (기존 방식 그대로: users/{uid}의 approved, isAdmin) ---------- */
onAuthStateChanged(auth, async user => {
  const run = ++generation;
  approved = false;
  $('adminLink').hidden = true;
  if (!user) { location.href = 'index.html'; return; }
  try {
    const a = await getDoc(doc(db, 'users', user.uid));
    if (run !== generation) return;
    if (!a.exists() || a.data().approved !== true) {
      status('관리자 승인 후 이용할 수 있습니다.');
      await signOut(auth);
      return;
    }
    approved = true;
    $('userEmail').textContent = user.email || '';
    $('adminLink').hidden = !a.data().isAdmin;
    await reload();
  } catch (e) {
    status(err(e));
  }
});
