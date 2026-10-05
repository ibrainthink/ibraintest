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
  list,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js';

import {
  DOMAINS,
  classifyFilename
} from './pdf-catalog.js';


const storage = getStorage(app);
const $ = id => document.getElementById(id);

let catalog = [];
let groups = [];
let selectedFiles = [];
let approved = false;
let generation = 0;

let fontLevel =
  Number(localStorage.getItem('iBrainFontLevel') || 0);


/* =========================
   글씨 크기
========================= */

function applyFont() {

  fontLevel = Math.max(-2, Math.min(5, fontLevel));

  const scale = 1 + fontLevel * 0.1;

  document.documentElement.style.setProperty(
    '--library-scale',
    String(scale)
  );

  const label = $('fontLabel');

  if (label) {
    label.textContent =
      Math.round(scale * 100) + '%';
  }

  localStorage.setItem(
    'iBrainFontLevel',
    String(fontLevel)
  );
}


if ($('fontDown')) {
  $('fontDown').onclick = () => {
    fontLevel--;
    applyFont();
  };
}

if ($('fontUp')) {
  $('fontUp').onclick = () => {
    fontLevel++;
    applyFont();
  };
}

applyFont();


/* =========================
   기본 함수
========================= */

function option(select, value, label) {

  const o = document.createElement('option');

  o.value = value;
  o.textContent = label;

  select.append(o);
}


function setStatus(text) {

  if ($('status')) {
    $('status').textContent = text;
  }
}


function errorMessage(error) {

  console.error(
    '문제자료실 오류',
    error
  );

  if (
    error?.code ===
    'storage/unauthorized'
  ) {
    return '자료 접근 권한이 없습니다.';
  }

  if (
    error?.code ===
    'storage/object-not-found'
  ) {
    return 'PDF 파일을 찾을 수 없습니다.';
  }

  return 'PDF를 불러오지 못했습니다.';
}


/* =========================
   Firebase PDF 목록
========================= */

async function scan(
  folder,
  results,
  run
) {

  let pageToken;

  do {

    const page = await list(
      folder,
      {
        maxResults: 100,
        ...(pageToken
          ? { pageToken }
          : {})
      }
    );

    if (run !== generation) {
      return;
    }

    for (const item of page.items) {

      if (/\.pdf$/i.test(item.name)) {

        results.push({
          ref: item,
          name: item.name,
          ...classifyFilename(
            item.name
          )
        });
      }
    }

    for (
      const prefix
      of page.prefixes
    ) {

      await scan(
        prefix,
        results,
        run
      );
    }

    pageToken =
      page.nextPageToken;

  } while (
    pageToken &&
    run === generation
  );
}


/* =========================
   영역 / 난이도 / 개수
========================= */

function fillStars() {

  const stars = $('stars');
  const domain =
    $('domain').value;

  stars.replaceChildren();

  option(
    stars,
    '',
    '난이도 선택'
  );

  $('qty').replaceChildren();

  option(
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
          f =>
            f.domain === domain
        )
        .map(
          f =>
            f.stars ??
            'unknown'
        )
    )
  ];

  levels.sort(
    (a, b) => {

      if (a === 'unknown') {
        return 1;
      }

      if (b === 'unknown') {
        return -1;
      }

      return a - b;
    }
  );

  levels.forEach(
    n => {

      option(
        stars,
        String(n),

        n === 'unknown'
          ? '난이도 미분류'
          : '★'.repeat(
              Number(n)
            )
      );
    }
  );

  stars.disabled = false;
}


function fillQty() {

  const domain =
    $('domain').value;

  const stars =
    $('stars').value;

  const qty = $('qty');

  qty.replaceChildren();

  option(
    qty,
    '',
    '개수 선택'
  );

  if (
    !domain ||
    !stars
  ) {

    qty.disabled = true;
    $('addSet').disabled = true;

    return;
  }

  const count =
    catalog.filter(
      f =>
        f.domain === domain &&
        String(
          f.stars ??
          'unknown'
        ) === stars
    ).length;

  for (
    let i = 1;
    i <= Math.min(
      count,
     
