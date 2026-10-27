
import { app, auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { getStorage, ref, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js';

const storage = getStorage(app);
const $ = id => document.getElementById(id);
const ages = Array.from({ length: 9 }, (_, i) => i + 5);
const urls = new Map();

let approved = false;
let generation = 0;
let previewGeneration = 0;
let selected = null;
let fontLevel = Number(localStorage.getItem('iBrainFontLevel') || 0);
let pdfjsPromise = null;

function status(message) {
  $('status').textContent = message;
}

function applyFont() {
  fontLevel = Math.max(-2, Math.min(5, fontLevel));
  const scale = 1 + fontLevel * 0.1;
  document.documentElement.style.setProperty('--library-scale', scale);
  $('fontLabel').textContent = Math.round(scale * 100) + '%';
  localStorage.setItem('iBrainFontLevel', String(fontLevel));
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

function clearPreview() {
  ++previewGeneration;
  selected = null;
  $('previewSection').hidden = true;
  $('pdfPages').replaceChildren();
}

async function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs'
    ).then(pdfjs => {
      pdfjs.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
      return pdfjs;
    }).catch(error => {
      pdfjsPromise = null;
      throw error;
    });
  }
  return pdfjsPromise;
}

async function renderPreview(url) {
  const run = ++previewGeneration;
  const container = $('pdfPages');

  container.replaceChildren();

  const message = document.createElement('p');
  message.className = 'pdf-loading';
  message.textContent = 'PDF 미리보기를 불러오는 중…';
  container.append(message);

  try {
    const pdfjs = await loadPdfJs();
    if (run !== previewGeneration) return;

    const loadingTask = pdfjs.getDocument({
      url: url,
      withCredentials: false
    });

    const pdf = await loadingTask.promise;

    if (run !== previewGeneration) {
      await pdf.destroy();
      return;
    }

    message.remove();

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      if (run !== previewGeneration) {
        await pdf.destroy();
        return;
      }

      const page = await pdf.getPage(pageNumber);
      const original = page.getViewport({ scale: 1 });

      const availableWidth = Math.max(
        200,
        Math.min(container.clientWidth - 28, 850)
      );

      const cssScale = availableWidth / original.width;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

      const viewport = page.getViewport({
        scale: cssScale * pixelRatio
      });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Canvas를 사용할 수 없습니다.');
      }

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = availableWidth + 'px';
      canvas.style.maxWidth = '100%';
      canvas.style.height = 'auto';

      container.append(canvas);

      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;
    }

    if (run === previewGeneration) {
      status(`${selected.age}세 평가지 미리보기 완료`);
    }

  } catch (error) {
    if (run !== previewGeneration) return;

    console.error('PDF 미리보기 오류:', error);

    container.replaceChildren();

    const notice = document.createElement('p');
    notice.className = 'pdf-loading';
    notice.textContent =
      '미리보기를 불러오지 못했습니다. 새 창에서 열기를 이용해 주세요.';

    container.append(notice);

    status('PDF 미리보기 오류가 발생했습니다.');
  }
}

function chooseAge(age) {
  const url = urls.get(age);
  if (!url) return;

  selected = { age, url };

  document.querySelectorAll('.age-card').forEach(button => {
    const active = Number(button.dataset.age) === age;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  });

  $('previewTitle').textContent = `${age}세 평가지 미리보기`;
  $('previewSection').hidden = false;

  status(`${age}세 평가지 선택 완료`);

  void renderPreview(url);

  $('previewSection').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

async function reload() {
  if (!approved) return;

  const run = ++generation;

  $('reload').disabled = true;
  clearPreview();
  urls.clear();

  const grid = $('ageGrid');
  grid.replaceChildren();

  status('나이별 PDF 확인 중…');

  try {
    const results = await Promise.all(
      ages.map(async age => {
        try {
          const url = await getDownloadURL(
            ref(storage, `evaluation-pdfs/age-${age}.pdf`)
          );
          return { age, url };
        } catch (error) {
          console.warn(`${age}세 PDF 확인 실패`, error);
          return { age, url: null, error };
        }
      })
    );

    if (run !== generation) return;

    let ready = 0;
    let denied = 0;

    for (const item of results) {
      if (item.url) {
        urls.set(item.age, item.url);
        ready++;
      } else if (item.error?.code === 'storage/unauthorized') {
        denied++;
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'age-card';
      button.dataset.age = String(item.age);
      button.disabled = !item.url;
      button.setAttribute('aria-pressed', 'false');

      const title = document.createElement('strong');
      title.textContent = `${item.age}세`;

      const caption = document.createElement('small');
      caption.textContent = item.url
        ? '미리보기 · 인쇄'
        : '준비 중';

      button.append(title, caption);
      button.onclick = () => chooseAge(item.age);

      grid.append(button);
    }

    if (denied) {
      status(`PDF ${ready}개 준비됨 · 일부 파일은 Storage 읽기 권한 확인이 필요합니다.`);
    } else {
      status(`PDF ${ready}개 준비됨 · 나이를 선택하세요.`);
    }

  } catch (error) {
    console.error(error);
    status('PDF 목록 확인 중 오류가 발생했습니다.');
  } finally {
    if (run === generation) {
      $('reload').disabled = false;
    }
  }
}

$('reload').onclick = reload;

$('open').onclick = () => {
  if (selected) {
    window.open(selected.url, '_blank', 'noopener');
  }
};

$('print').onclick = () => {
  if (!selected) return;

  window.open(selected.url, '_blank', 'noopener');
  status('열린 PDF에서 인쇄 버튼을 눌러주세요.');
};

$('logoutBtn').onclick = async () => {
  try {
    await signOut(auth);
    location.href = 'index.html';
  } catch (error) {
    console.error(error);
    status('로그아웃에 실패했습니다.');
  }
};

onAuthStateChanged(auth, async user => {
  const run = ++generation;

  approved = false;
  clearPreview();
  urls.clear();

  $('adminLink').hidden = true;
  $('reload').disabled = true;

  if (!user) {
    location.href = 'index.html';
    return;
  }

  try {
    const snap = await getDoc(doc(db, 'users', user.uid));

    if (run !== generation) return;

    if (!snap.exists() || snap.data().approved !== true) {
      status('관리자 승인 후 이용할 수 있습니다.');
      await signOut(auth);
      return;
    }

    approved = true;
    $('userEmail').textContent = user.email || '';
    $('adminLink').hidden = !snap.data().isAdmin;

    await reload();

  } catch (error) {
    console.error(error);
    status('로그인 권한 확인 중 오류가 발생했습니다.');
  }
});
