import { app, auth, db } from './firebase-config.js';

import {
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';

import {
  doc,
  getDoc
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

import {
  getStorage,
  ref,
  listAll,
  getDownloadURL,
  getBytes
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js';

import {
  DOMAINS,
  classifyFilename
} from './pdf-catalog.js';

/* PDF 실제 화면 렌더링 */
import * as pdfjsLib
  from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';


const storage = getStorage(app);
const $ = id => document.getElementById(id);

let catalog = [];
let groups = [];
let selectedFiles = [];

let fontLevel =
  Number(localStorage.getItem('iBrainFontLevel') || 0);

const bytesCache = new Map();
const urlCache = new Map();


/* =====================================================
   글씨 크기
===================================================== */

function applyFont() {

  fontLevel =
    Math.max(-2, Math.min(5, fontLevel));

  const scale =
    1 + fontLevel * 0.1;

  document.documentElement.style.setProperty(
    '--library-scale',
    String(scale)
  );

  if ($('fontLabel')) {
    $('fontLabel').textContent =
      Math.round(scale * 100) + '%';
  }

  localStorage.setItem(
    'iBrainFontLevel',
    String(fontLevel)
  );
}

$('fontDown').onclick = () => {
  fontLevel--;
  applyFont();
};

$('fontUp').onclick = () => {
  fontLevel++;
  applyFont();
};

applyFont();


/* =====================================================
   로그아웃
===================================================== */

$('logoutBtn').onclick = async () => {

  await signOut(auth);

  location.href = 'index.html';
};


/* =====================================================
   기본 함수
===================================================== */

function setStatus(text) {

  if ($('status')) {
    $('status').textContent = text;
  }
}


function addOption(select, value, text) {

  const option =
    document.createElement('option');

  option.value = value;
  option.textContent = text;

  select.append(option);
}


function shuffle(array) {

  const copy = [...array];

  for (
    let i = copy.length - 1;
    i > 0;
    i--
  ) {

    const j =
      Math.floor(
        Math.random() * (i + 1)
      );

    [
      copy[i],
      copy[j]
    ] = [
      copy[j],
      copy[i]
    ];
  }

  return copy;
}


/* =====================================================
   Storage 안 PDF 전체 읽기
===================================================== */

async function scanFolder(folderRef) {

  const result =
    await listAll(folderRef);

  const files =
    [...result.items];

  for (
    const folder
    of result.prefixes
  ) {

    const childFiles =
      await scanFolder(folder);

    files.push(...childFiles);
  }

  return files;
}


async function loadCatalog() {

  try {

    $('reload').disabled = true;

    setStatus(
      'PDF 목록 불러오는 중…'
    );

    const root =
      ref(
        storage,
        'evaluation-pdfs'
      );

    const files =
      await scanFolder(root);

    catalog =
      files
        .filter(
          file =>
            /\.pdf$/i.test(file.name)
        )
        .map(
          file => ({
            ref: file,
            name: file.name,
            ...classifyFilename(file.name)
          })
        );

    catalog.sort(
      (a, b) =>
        a.name.localeCompare(
          b.name,
          'ko'
        )
    );

    fillDomains();

    setStatus(
      `PDF ${catalog.length}개를 불러왔습니다.`
    );

    $('reload').disabled = false;

  }
  catch (error) {

    console.error(error);

    setStatus(
      'PDF 목록을 불러오지 못했습니다.'
    );

    $('reload').disabled = false;
  }
}


/* =====================================================
   영역 선택
===================================================== */

function fillDomains() {

  const select =
    $('domain');

  select.replaceChildren();

  addOption(
    select,
    '',
    '영역 선택'
  );

  DOMAINS.forEach(
    domain => {

      addOption(
        select,
        domain.label,
        domain.label
      );
    }
  );

  select.disabled = false;
}


/* =====================================================
   난이도 선택
===================================================== */

function fillStars() {

  const domain =
    $('domain').value;

  const stars =
    $('stars');

  stars.replaceChildren();

  addOption(
    stars,
    '',
    '난이도 선택'
  );

  $('qty').replaceChildren();

  addOption(
    $('qty'),
    '',
    '개수 선택'
  );

  $('qty').disabled = true;
  $('addSet').disabled = true;

  if (!domain) {

    stars.disabled = true;

    return;
  }

  const levels = [
    ...new Set(
      catalog
        .filter(
          file =>
            file.domain === domain &&
            file.stars
        )
        .map(
          file => file.stars
        )
    )
  ].sort(
    (a, b) => a - b
  );

  levels.forEach(
    level => {

      addOption(
        stars,
        String(level),
        '★'.repeat(level)
      );
    }
  );

  stars.disabled = false;
}


/* =====================================================
   PDF 개수 선택
   1개 = PDF 파일 1개
===================================================== */

function fillQty() {

  const domain =
    $('domain').value;

  const stars =
    $('stars').value;

  const qty =
    $('qty');

  qty.replaceChildren();

  addOption(
    qty
