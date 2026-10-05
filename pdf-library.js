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

const urlCache = new Map();
const bytesCache = new Map();

let fontLevel =
  Number(localStorage.getItem('iBrainFontLevel') || 0);


/* =========================================
   글씨 크기
========================================= */

function applyFont() {

  fontLevel = Math.max(-2, Math.min(5, fontLevel));

  const scale = 1 + fontLevel * 0.1;

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


/* =========================================
   로그아웃
========================================= */

$('logoutBtn').onclick = async () => {

  await signOut(auth);

  location.href = 'index.html';
};


/* =========================================
   기본 함수
========================================= */

function setStatus(text) {

  if ($('status')) {
    $('status').textContent = text;
  }
}


function addOption(
  select,
  value,
  text
) {

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


/* =========================================
   Firebase Storage PDF 읽기
========================================= */

async function scanFolder(folderRef) {

  const result =
    await listAll(folderRef);

  const files =
    [...result.items];

  for (
    const folder
    of result.prefixes
  ) {

    const children =
      await scanFolder(folder);

    files.push(...children);
  }

  return files;
}


async function loadCatalog() {

  try {

    setStatus(
      'PDF 목록 불러오는 중…'
    );

    $('reload').disabled = true;

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
            /\.pdf$/i.test(
              file.name
            )
        )
        .map(
          file => ({
            ref: file,
            name: file.name,
            ...classifyFilename(
              file.name
            )
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


/* =========================================
   영역
========================================= */

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
    item => {

      addOption(
        select,
        item.label,
        item.label
      );
    }
  );

  select.disabled = false;
}


/* =========================================
   난이도
========================================= */

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

  const levels =
    [
      ...new Set(
        catalog
          .filter(
            file =>
              file.domain === domain &&
              file.stars
          )
          .map(
            file =>
              file.stars
          )
      )
    ].sort(
      (a, b) =>
        a - b
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


/* =========================================
   PDF 개수
========================================= */

function fillQty() {

  const domain =
    $('domain').value;

  const stars =
    $('stars').value;

  const qty =
    $('qty');

  qty.replaceChildren();

  addOption(
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
      file =>
        file.domain === domain &&
        String(
          file.stars
        ) === stars
    ).length;

  for (
    let i = 1;
    i <= count;
    i++
  ) {

    addOption(
      qty,
      String(i),
      i + '개'
    );
  }

  qty.disabled = false;
}


/* =========================================
   문제 선택
========================================= */

function pickFiles(group) {

  const available =
    catalog.filter(
      file =>
        file.domain ===
          group.domain &&
        String(
          file.stars
        ) ===
          String(
            group.stars
          )
    );

  return shuffle(
    available
  ).slice(
    0,
    group.qty
  );
}


function rebuildSelectedFiles() {

  selectedFiles =
    groups.flatMap(
      group =>
        group.files
    );

  renderBundle();

  /* 추가하자마자 바로 미리보기 */
  renderPreviews();
}


/* =========================================
   선택한 구성 표시
========================================= */

function renderBundle() {

  const box =
    $('bundle');

  box.replaceChildren();

  const total =
    groups.reduce(
      (sum, group) =>
        sum + group.qty,
      0
    );

  $('totalCount').textContent =
    `총 ${total}개`;

  if (!groups.length) {

    box.innerHTML =
      '<p class="empty">위에서 영역·난이도·개수를 선택해 추가하세요.</p>';
  }

  groups.forEach(
    (group, index) => {

      const chip =
        document.createElement(
          'div'
        );

      chip.className =
        'bundle-chip';

      const label =
        document.createElement(
          'span'
        );

      label.textContent =
        `${group.domain} · ${'★'.repeat(group.stars)} · ${group.qty}개`;

      const remove =
        document.createElement(
          'button'
        );

      remove.type =
        'button';

      remove.textContent =
        '×';

      remove.onclick =
        () => {

          groups.splice(
            index,
            1
          );

          rebuildSelectedFiles();
        };

      chip.append(
        label,
        remove
      );

      box.append(
        chip
      );
    }
  );

  const has =
    groups.length > 0;

  $('clearBundle').disabled =
    !has;

  $('reroll').disabled =
    !has;

  $('makePreview').disabled =
    !has;

  $('print').disabled =
    !has;

  $('open').disabled =
    !has;
}


/* =========================================
   PDF 주소
========================================= */

async function getFileURL(file) {

  if (
    urlCache.has(
      file.name
    )
  ) {

    return urlCache.get(
      file.name
    );
  }

  const url =
    await getDownloadURL(
      file.ref
    );

  urlCache.set(
    file.name,
    url
  );

  return url;
}


/* =========================================
   PDF 데이터
========================================= */

async function getFileBytes(file) {

  if (
    bytesCache.has(
      file.name
    )
  ) {

    return bytesCache.get(
      file.name
    );
  }

  const url =
    await getFileURL(
      file
    );

  const response =
    await fetch(url);

  if (!response.ok) {

    throw new Error(
      'PDF 다운로드 실패'
    );
  }

  const bytes =
    await response.arrayBuffer();

  bytesCache.set(
    file.name,
    bytes
  );

  return bytes;
}


/* =========================================
   작은 미리보기
========================================= */

async function renderThumbnail(
  file,
  canvas,
  loading
) {

  try {

    const url =
      await getFileURL(
        file
      );

    /*
      작은 미리보기는 브라우저 PDF 뷰어를
      직접 사용하지 않고 iframe으로 표시.
      Firebase 다운로드 주소를 그대로 사용.
    */

    const iframe =
      document.createElement(
        'iframe'
      );

    iframe.src =
      url +
      '#page=1&zoom=35&toolbar=0&navpanes=0&scrollbar=0';

    iframe.title =
      file.name;

    iframe.style.width =
      '100%';

    iframe.style.height =
      '100%';

    iframe.style.border =
      '0';

    iframe.style.background =
      '#fff';

    iframe.onload =
      () => {

        loading.remove();
      };

    canvas.replaceWith(
      iframe
    );

    setTimeout(
      () => {

        if (
          loading.isConnected
        ) {

          loading.textContent =
            'PDF를 눌러 크게 보기';
        }

      },
      3000
    );

  }
  catch (error) {

    console.error(error);

    loading.textContent =
      '미리보기 실패';
  }
}


/* =========================================
   미리보기 목록
========================================= */

function renderPreviews() {

  const box =
    $('previewList');

  box.replaceChildren();

  if (
    !selectedFiles.length
  ) {

    box.innerHTML =
      '<p class="empty">아직 선택된 문제가 없습니다.</p>';

    $('selected').textContent =
      '문제 구성을 만든 뒤 미리보기를 눌러주세요.';

    $('print').disabled = true;
    $('open').disabled = true;

    return;
  }

  $('selected').textContent =
    `선택한 PDF ${selectedFiles.length}개`;

  $('print').disabled = false;
  $('open').disabled = false;

  selectedFiles.forEach(
    (file, index) => {

      const card =
        document.createElement(
          'button'
        );

      card.type =
        'button';

      card.className =
        'pdf-thumb-card';

      const wrap =
        document.createElement(
          'div'
        );

      wrap.className =
        'thumb-canvas-wrap';

      /*
        기존 CSS를 그대로 쓰기 위해
        canvas 자리를 먼저 생성
      */

      const canvas =
        document.createElement(
          'canvas'
        );

      const loading =
        document.createElement(
          'div'
        );

      loading.className =
        'thumb-loading';

      loading.textContent =
        '불러오는 중…';

      const name =
        document.createElement(
          'div'
        );

      name.className =
        'thumb-name';

      name.textContent =
        `${index + 1}. ${file.name}`;

      wrap.append(
        canvas,
        loading
      );

      card.append(
        wrap,
        name
      );

      card.onclick =
        event => {

          /*
            iframe 자체를 누른 경우에도
            아래 큰 미리보기 버튼 역할을
            하도록 카드 클릭 사용
          */

          showLarge(
            file
          );
        };

      box.append(
        card
      );

      renderThumbnail(
        file,
        canvas,
        loading
      );
    }
  );
}


/* =========================================
   크게 보기
========================================= */

async function showLarge(file) {

  try {

    const url =
      await getFileURL(
        file
      );

    const area =
      $('largePreview');

    const oldCanvas =
      $('largeCanvas');

    if (oldCanvas) {
      oldCanvas.style.display =
        'none';
    }

    let frame =
      document.getElementById(
        'largePdfFrame'
      );

    if (!frame) {

      frame =
        document.createElement(
          'iframe'
        );

      frame.id =
        'largePdfFrame';

      frame.style.width =
        '100%';

      frame.style.height =
        '75vh';

      frame.style.border =
        '0';

      frame.style.background =
        '#fff';

      frame.style.borderRadius =
        '10px';

      area.append(
        frame
      );
    }

    $('largePreviewName').textContent =
      file.name;

    frame.src =
      url +
      '#page=1&zoom=page-width';

    area.hidden =
      false;

    area.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });

  }
  catch (error) {

    console.error(error);

    alert(
      'PDF를 열지 못했습니다.'
    );
  }
}


/* =========================================
   선택 PDF 하나로 합치기
========================================= */

async function createMergedPDF() {

  if (
    !window.PDFLib
  ) {

    throw new Error(
      'PDF-Lib를 불러오지 못했습니다.'
    );
  }

  const output =
    await PDFLib.PDFDocument.create();

  for (
    const file
    of selectedFiles
  ) {

    const bytes =
      await getFileBytes(
        file
      );

    const source =
      await PDFLib.PDFDocument.load(
        bytes
      );

    const pageIndexes =
      source.getPageIndices();

    const pages =
      await output.copyPages(
        source,
        pageIndexes
      );

    pages.forEach(
      page =>
        output.addPage(
          page
        )
    );
  }

  const result =
    await output.save();

  return new Blob(
    [result],
    {
      type:
        'application/pdf'
    }
  );
}


/* =========================================
   새 창 / 인쇄
========================================= */

async function openMergedPDF(
  printAfterOpen = false
) {

  if (
    !selectedFiles.length
  ) {

    return;
  }

  const button =
    printAfterOpen
      ? $('print')
      : $('open');

  const oldText =
    button.textContent;

  try {

    button.disabled =
      true;

    button.textContent =
      'PDF 만드는 중…';

    const blob =
      await createMergedPDF();

    const url =
      URL.createObjectURL(
        blob
      );

    const win =
      window.open(
        url,
        '_blank'
      );

    if (!win) {

      alert(
        '팝업이 차단되었습니다. 브라우저에서 팝업을 허용해주세요.'
      );

      return;
    }

    if (
      printAfterOpen
    ) {

      setTimeout(
        () => {

          try {

            win.focus();
            win.print();

          }
          catch (error) {

            console.error(
              error
            );
          }

        },
        1500
      );
    }

    setTimeout(
      () => {

        URL.revokeObjectURL(
          url
        );

      },
      60000
    );

  }
  catch (error) {

    console.error(error);

    alert(
      'PDF를 만드는 중 오류가 발생했습니다.'
    );

  }
  finally {

    button.disabled =
      false;

    button.textContent =
      oldText;
  }
}


/* =========================================
   버튼 이벤트
========================================= */

$('domain').onchange =
  fillStars;

$('stars').onchange =
  fillQty;

$('qty').onchange =
  () => {

    $('addSet').disabled =
      !$('qty').value;
  };


$('addSet').onclick =
  () => {

    const domain =
      $('domain').value;

    const stars =
      Number(
        $('stars').value
      );

    const qty =
      Number(
        $('qty').value
      );

    if (
      !domain ||
      !stars ||
      !qty
    ) {

      return;
    }

    const group = {
      domain,
      stars,
      qty
    };

    group.files =
      pickFiles(
        group
      );

    groups.push(
      group
    );

    rebuildSelectedFiles();
  };


$('clearBundle').onclick =
  () => {

    groups = [];

    rebuildSelectedFiles();
  };


$('reroll').onclick =
  () => {

    groups.forEach(
      group => {

        group.files =
          pickFiles(
            group
          );
      }
    );

    rebuildSelectedFiles();
  };


$('makePreview').onclick =
  () => {

    renderPreviews();
  };


$('closeLarge').onclick =
  () => {

    $('largePreview').hidden =
      true;
  };


$('open').onclick =
  () => {

    openMergedPDF(
      false
    );
  };


$('print').onclick =
  () => {

    openMergedPDF(
      true
    );
  };


$('reload').onclick =
  () => {

    loadCatalog();
  };


/* =========================================
   로그인 확인
========================================= */

onAuthStateChanged(
  auth,

  async user => {

    /*
      로그인 안 된 경우
    */

    if (!user) {

      location.href =
        'index.html';

      return;
    }

    try {

      const userDoc =
        await getDoc(
          doc(
            db,
            'users',
            user.uid
          )
        );

      /*
        사용자 문서가 없거나
        승인 안 된 계정
      */

      if (
        !userDoc.exists() ||
        userDoc.data().approved !== true
      ) {

        await signOut(
          auth
        );

        location.href =
          'index.html';

        return;
      }

      /*
        정상 로그인
      */

      if ($('userEmail')) {

        $('userEmail').textContent =
          user.email || '';
      }

      /*
        관리자만 관리자 메뉴 표시
      */

      if (
        userDoc.data().isAdmin === true &&
        $('adminLink')
      ) {

        $('adminLink').hidden =
          false;
      }

      /*
        로그인 확인이 끝난 뒤에만
        PDF 목록 불러오기
      */

      await loadCatalog();

    }
    catch (error) {

      console.error(
        '로그인 확인 오류:',
        error
      );

      setStatus(
        '로그인 정보를 확인하지 못했습니다.'
      );
    }
  }
);
