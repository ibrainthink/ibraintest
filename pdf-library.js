import { app, auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { getStorage, ref, listAll, getBytes } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js';
import { DOMAINS, classifyFilename } from './pdf-catalog.js';

const $ = id => document.getElementById(id);
const storage = getStorage(app);

let catalog = [];
let groups = [];
let selectedFiles = [];
let pdfjs = null;
let fontLevel = Number(localStorage.getItem('iBrainFontLevel') || 0);
const byteCache = new Map();

/* 글씨 크기 */
function fontApply() {
  fontLevel = Math.max(-2, Math.min(5, fontLevel));
  const scale = 1 + fontLevel * .1;
  document.documentElement.style.setProperty('--library-scale', scale);
  $('fontLabel').textContent = Math.round(scale * 100) + '%';
  localStorage.setItem('iBrainFontLevel', fontLevel);
}
$('fontDown').onclick = () => { fontLevel--; fontApply(); };
$('fontUp').onclick = () => { fontLevel++; fontApply(); };
fontApply();

$('logoutBtn').onclick = async () => {
  await signOut(auth);
  location.href = 'index.html';
};

function status(text) {
  $('status').textContent = text;
}

function option(el, value, text) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = text;
  el.append(o);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Storage PDF 전체 검색 */
async function scan(folder, result = []) {
  const r = await listAll(folder);
  result.push(...r.items);
  for (const sub of r.prefixes) await scan(sub, result);
  return result;
}

async function loadCatalog() {
  try {
    $('reload').disabled = true;
    status('PDF 목록 불러오는 중…');

    const files = await scan(ref(storage, 'evaluation-pdfs'));

    catalog = files
      .filter(f => /\.pdf$/i.test(f.name))
      .map(f => ({
        ref: f,
        name: f.name,
        ...classifyFilename(f.name)
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    fillDomains();
    status(`PDF ${catalog.length}개를 불러왔습니다.`);
  } catch (e) {
    console.error(e);
    status('PDF 목록을 불러오지 못했습니다.');
  } finally {
    $('reload').disabled = false;
  }
}

/* 선택창 */
function fillDomains() {
  $('domain').replaceChildren();
  option($('domain'), '', '영역 선택');
  DOMAINS.forEach(d => option($('domain'), d
