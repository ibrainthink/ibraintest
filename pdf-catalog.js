import { app, auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { getStorage, ref, list, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js';
import { DOMAINS, classifyFilename } from './pdf-catalog.js';

const storage = getStorage(app);
const $ = id => document.getElementById(id);

let catalog = [];
let approved = false;
let generation = 0;
let groups = [];
let selectedFiles = [];
let fontLevel = Number(localStorage.getItem('pdfLibraryFontLevel') || 0);

function option(select, value, label) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  select.append(o);
}

function showStatus(text) {
  const el = $('status');
  if (el) el.textContent = text;
}

function errorMessage(error) {
  console.error('문제자료실', error);

  if (error?.code === 'storage/unauthorized') {
    return '자료 접근 권한이 없습니다. Storage 규칙을 확인해 주세요.';
  }

  if (error?.code === 'storage/object-not-found') {
    return '파일이 삭제되었거나 이동되었습니다.';
  }

  return '자료를 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.';
}

async function scan(folder, results, run) {
  let pageToken;

  do {
    const page = await list(folder, {
      maxResults: 100,
      ...(pageToken ? { pageToken } : {})
    });

    if (run !== generation) return;

    for (const item of page.items) {
      if (/\.pdf$/i.test(item.name)) {
        results.push({
          ref: item,
          name: item.name,
          ...classifyFilename(item.name)
        });
      }
    }

    for (const prefix of page.prefixes) {
      await scan(prefix, results, run);
    }

    pageToken = page.nextPageToken;
  } while (pageToken && run === generation);
}

function fillDomains() {
  const domain = $('domain');
  domain.replaceChildren();
  option(domain, '', '영역 선택');

  [...DOMAINS.map(d => d.label), '미분류']
    .filter(d => catalog.some(f => f.domain === d))
    .forEach(d => option(domain, d, d));
}

function fillStars() {
  const stars = $('stars');
  stars.replaceChildren();
  option(stars, '', '별 난이도 선택');

  const domain = $('domain').value;

  if (!domain) {
    stars.disabled = true;
    return;
  }

  const levels = [
    ...new Set(
      catalog
        .filter(f => f.domain === domain)
        .map(f => f.stars ?? 'unknown')
    )
  ].sort((a, b) => {
    if (a === 'unknown') return 1;
    if (b === 'unknown') return -1;
    return a - b;
  });

  levels.forEach(n => {
    option(
      stars,
      String(n),
      n === 'unknown' ? '난이도 미분류' : '★'.repeat(n)
    );
  });

  stars.disabled = false;
}

function shuffle(items) {
  const arr = [...items];

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

function candidatesFor(group) {
  return catalog.filter(file =>
    file.domain === group.domain &&
    String(file.stars ?? 'unknown') === String(group.stars)
  );
}

function rebuildSelection() {
  const used = new Set();
  selectedFiles = [];

  for (const group of groups) {
    const candidates = shuffle(
      candidatesFor(group).filter(file => !used.has(file.name))
    );

    const picked = candidates.slice(0, group.count);

    for (const file of picked) {
      used.add(file.name);
      selectedFiles.push({
        ...file,
        groupId: group.id
      });
    }

    group.actualCount = picked.length;
  }

  renderGroups();
  renderSelected();
}

function renderGroups() {
  const box = $('selectionList');
  if (!box) return;

  box.replaceChildren();

  if (!groups.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-selection';
    empty.textContent = '아직 선택한 문제가 없습니다.';
    box.append(empty);
    return;
  }

  groups.forEach(group => {
    const row = document.createElement('div');
    row.className = 'selection-row';

    const text = document.createElement('div');
    text.className = 'selection-text';

    const starText =
      group.stars === 'unknown'
        ? '난이도 미분류'
        : '★'.repeat(Number(group.stars));

    text.textContent =
      `${group.domain} · ${starText} · ${group.actualCount ?? group.count}개`;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-selection';
    remove.textContent = '삭제';
    remove.setAttribute('aria-label', `${group.domain} 선택 삭제`);

    remove.onclick = () => {
      groups = groups.filter(g => g.id !== group.id);
      rebuildSelection();
    };

    row.append(text, remove);
    box.append(row);
  });
}

function renderSelected() {
  const total = $('totalCount');
  const preview = $('previewList');

  if (total) {
    total.textContent = `총 ${selectedFiles.length}개`;
  }

  if (!preview) return;

  preview.replaceChildren();

  if (!selectedFiles.length) {
    const p = document.createElement('p');
    p.className = 'empty-preview';
    p.textContent = '영역, 별 난이도, 개수를 선택한 뒤 추가해 주세요.';
    preview.append(p);

    if ($('printAll')) $('printAll').disabled = true;
    if ($('openAll')) $('openAll').disabled = true;
    return;
  }

  selectedFiles.forEach((file, index) => {
    const card = document.createElement('div');
    card.className = 'preview-card';

    const number = document.createElement('div');
    number.className = 'preview-number';
    number.textContent = `${index + 1}`;

    const info = document.createElement('div');
    info.className = 'preview-info';

    const title = document.createElement('strong');
    title.textContent = file.name;

    const meta = document.createElement('span');
    meta.textContent =
      `${file.domain} · ${
        file.stars == null ? '난이도 미분류' : '★'.repeat(file.stars)
      }`;

    info.append(title, meta);

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'preview-open';
    open.textContent = '보기';

    open.onclick = async () => {
      try {
        const url = await getDownloadURL(file.ref);
        window.open(url, '_blank', 'noopener');
      } catch (e) {
        showStatus(errorMessage(e));
      }
    };

    card.append(number, info, open);
    preview.append(card);
  });

  if ($('printAll')) $('printAll').disabled = false;
  if ($('openAll')) $('openAll').disabled = false;
}

function addGroup() {
  const domain = $('domain').value;
  const stars = $('stars').value;
  const count = Number($('quantity').value || 0);

  if (!domain) {
    showStatus('먼저 영역을 선택해 주세요.');
    return;
  }

  if (!stars) {
    showStatus('별 난이도를 선택해 주세요.');
    return;
  }

  if (!Number.isInteger(count) || count < 1) {
    showStatus('문제 개수를 1개 이상 선택해 주세요.');
    return;
  }

  const available = catalog.filter(file =>
    file.domain === domain &&
    String(file.stars ?? 'unknown') === stars
  );

  if (!available.length) {
    showStatus('해당 영역과 난이도의 PDF가 없습니다.');
    return;
  }

  const requested = Math.min(count, available.length);

  groups.push({
    id: `${Date.now()}-${Math.random()}`,
    domain,
    stars,
    count: requested
  });

  rebuildSelection();

  if (requested < count) {
    showStatus(
      `${domain} ${stars === 'unknown' ? '' : '★'.repeat(Number(stars))} 자료가 ${available.length}개뿐이라 ${available.length}개를 추가했습니다.`
    );
  } else {
    showStatus(`선택 완료 · 현재 총 ${selectedFiles.length}개`);
  }
}

function reroll() {
  if (!groups.length) {
    showStatus('먼저 문제를 추가해 주세요.');
    return;
  }

  rebuildSelection();
  showStatus(`다시 뽑았습니다 · 총 ${selectedFiles.length}개`);
}

function clearAll() {
  groups = [];
  selectedFiles = [];
  renderGroups();
  renderSelected();
  showStatus('선택한 문제를 모두 비웠습니다.');
}

async function openAll() {
  if (!selectedFiles.length) return;

  showStatus('선택한 PDF를 여는 중입니다…');

  try {
    const urls = [];

    for (const file of selectedFiles) {
      urls.push(await getDownloadURL(file.ref));
    }

    if (urls.length === 1) {
      window.open(urls[0], '_blank', 'noopener');
      return;
    }

    const listWindow = window.open('', '_blank');

    if (!listWindow) {
      showStatus(
        '팝업이 차단되었습니다. 브라우저에서 팝업을 허용한 뒤 다시 눌러 주세요.'
      );
      return;
    }

    const safeItems = urls.map((url, index) => {
      const name = selectedFiles[index].name
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

      return `
        <li>
          <a href="${url}" target="_blank" rel="noopener">
            ${index + 1}. ${name}
          </a>
        </li>
      `;
    }).join('');

    listWindow.document.write(`
      <!doctype html>
      <html lang="ko">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>선택한 문제</title>
        <style>
          body{
            font-family:Arial,"Noto Sans KR",sans-serif;
            padding:24px;
            font-size:18px;
            line-height:1.6;
            color:#172b4d;
          }
          h1{font-size:26px;}
          li{margin:12px 0;}
          a{color:#17365d;}
        </style>
      </head>
      <body>
        <h1>선택한 문제 ${urls.length}개</h1>
        <p>PDF 이름을 누르면 문제를 확인할 수 있습니다.</p>
        <ol>${safeItems}</ol>
      </body>
      </html>
    `);

    listWindow.document.close();
    showStatus(`선택한 PDF ${urls.length}개를 준비했습니다.`);
  } catch (e) {
    showStatus(errorMessage(e));
  }
}

async function printAll() {
  if (!selectedFiles.length) return;

  showStatus('인쇄할 PDF를 준비하는 중입니다…');

  /*
   * 모바일 브라우저에서는 여러 PDF의 인쇄창을 한 번에 자동으로
   * 띄우는 기능이 차단될 수 있습니다.
   * 따라서 인쇄용 목록 화면을 먼저 열어 각 PDF를 안전하게
   * 확인하고 인쇄할 수 있도록 합니다.
   */
  try {
    const urls = [];

    for (const file of selectedFiles) {
      urls.push(await getDownloadURL(file.ref));
    }

    const printWindow = window.open('', '_blank');

    if (!printWindow) {
      showStatus(
        '팝업이 차단되었습니다. 브라우저의 팝업 허용 후 다시 눌러 주세요.'
      );
      return;
    }

    const rows = urls.map((url, index) => {
      const name = selectedFiles[index].name
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

      return `
        <div class="item">
          <div class="num">${index + 1}</div>
          <div class="name">${name}</div>
          <a href="${url}" target="_blank" rel="noopener">PDF 열기 / 인쇄</a>
        </div>
      `;
    }).join('');

    printWindow.document.write(`
      <!doctype html>
      <html lang="ko">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>문제 인쇄</title>
        <style>
          body{
            margin:0;
            padding:20px;
            font-family:Arial,"Noto Sans KR",sans-serif;
            color:#172b4d;
            background:#f7f9fc;
            font-size:18px;
          }
          .wrap{
            max-width:760px;
            margin:auto;
          }
          h1{
            font-size:28px;
            margin-bottom:8px;
          }
          .notice{
            background:white;
            padding:16px;
            border-radius:12px;
            margin:16px 0;
          }
          .item{
            display:grid;
            grid-template-columns:44px 1fr;
            gap:8px 12px;
            background:white;
            padding:15px;
            margin:10px 0;
            border-radius:12px;
          }
          .num{
            grid-row:1 / 3;
            width:38px;
            height:38px;
            border-radius:50%;
            display:flex;
            align-items:center;
            justify-content:center;
            background:#17365d;
            color:white;
            font-weight:700;
          }
          .name{
            font-weight:700;
            overflow-wrap:anywhere;
          }
          a{
            color:#17365d;
            font-weight:700;
          }
        </style>
      </head>
      <body>
        <div class="wrap">
          <h1>문제 인쇄 · ${urls.length}개</h1>
          <div class="notice">
            휴대폰에서는 PDF를 하나씩 열어 인쇄해 주세요.
            PC에서는 각 PDF를 열어 인쇄하면 됩니다.
          </div>
          ${rows}
        </div>
      </body>
      </html>
    `);

    printWindow.document.close();
    showStatus(`인쇄할 PDF ${urls.length}개를 준비했습니다.`);
  } catch (e) {
    showStatus(errorMessage(e));
  }
}

function applyFontSize() {
  fontLevel = Math.max(-2, Math.min(5, fontLevel));

  document.documentElement.style.setProperty(
    '--user-font-scale',
    String(1 + fontLevel * 0.1)
  );

  localStorage.setItem('pdfLibraryFontLevel', String(fontLevel));

  const label = $('fontSizeLabel');
  if (label) {
    label.textContent = `${Math.round((1 + fontLevel * 0.1) * 100)}%`;
  }
}

async function reload() {
  if (!approved) return;

  const run = ++generation;

  $('reload').disabled = true;
  $('domain').disabled = true;
  $('stars').disabled = true;

  catalog = [];
  groups = [];
  selectedFiles = [];

  renderGroups();
  renderSelected();

  showStatus('PDF 목록을 불러오는 중…');

  try {
    const found = [];

    await scan(ref(storage, 'evaluation-pdfs'), found, run);

    if (run !== generation) return;

    catalog = found.sort((a, b) =>
      a.name.localeCompare(b.name, 'ko', { numeric: true })
    );

    fillDomains();

    $('domain').disabled = false;

    const unknown = catalog.filter(
      f => f.domain === '미분류' || f.stars == null
    ).length;

    showStatus(
      `PDF ${catalog.length}개 불러옴` +
      (unknown ? ` · 분류 확인 필요 ${unknown}개` : '')
    );
  } catch (e) {
    if (run === generation) {
      showStatus(errorMessage(e));
    }
  } finally {
    if (run === generation) {
      $('reload').disabled = false;
    }
  }
}

/* 화면 버튼 연결 */

$('domain').onchange = () => {
  fillStars();
};

$('addSelection').onclick = addGroup;
$('reroll').onclick = reroll;
$('clearAll').onclick = clearAll;
$('openAll').onclick = openAll;
$('printAll').onclick = printAll;
$('reload').onclick = reload;

$('fontMinus').onclick = () => {
  fontLevel--;
  applyFontSize();
};

$('fontPlus').onclick = () => {
  fontLevel++;
  applyFontSize();
};

$('logoutBtn').onclick = () =>
  signOut(auth).then(() => {
    location.href = 'index.html';
  });

applyFontSize();
renderGroups();
renderSelected();

/* 로그인 및 승인 회원 확인 */

onAuthStateChanged(auth, async user => {
  const run = ++generation;
  approved = false;

  if ($('adminLink')) {
    $('adminLink').hidden = true;
  }

  if (!user) {
    location.href = 'index.html';
    return;
  }

  try {
    const account = await getDoc(doc(db, 'users', user.uid));

    if (run !== generation) return;

    if (!account.exists() || account.data().approved !== true) {
      await signOut(auth);
      return;
    }

    approved = true;

    if ($('userEmail')) {
      $('userEmail').textContent = user.email || '';
    }

    if ($('adminLink')) {
      $('adminLink').hidden = !account.data().isAdmin;
    }

    await reload();
  } catch (e) {
    if (run === generation) {
      showStatus(errorMessage(e));
    }
  }
});
