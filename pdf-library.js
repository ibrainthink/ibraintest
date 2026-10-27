import { app, auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { getStorage, ref, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js';

// Firebase Storage: evaluation-pdfs/age-5.pdf ... age-13.pdf
// 기존 108개 PDF는 건드리지 않으며, 위 9개 파일만 화면에 표시합니다.
const storage = getStorage(app);
const $ = id => document.getElementById(id);
const ages = Array.from({ length: 9 }, (_, i) => i + 5);
let approved = false;
let generation = 0;
let selected = null;
let fontLevel = Number(localStorage.getItem('iBrainFontLevel') || 0);
const urls = new Map();

function status(message) { $('status').textContent = message; }
function applyFont() {
  fontLevel = Math.max(-2, Math.min(5, fontLevel));
  const scale = 1 + fontLevel * 0.1;
  document.documentElement.style.setProperty('--library-scale', scale);
  $('fontLabel').textContent = Math.round(scale * 100) + '%';
  localStorage.setItem('iBrainFontLevel', String(fontLevel));
}
$('fontDown').onclick = () => { fontLevel--; applyFont(); };
$('fontUp').onclick = () => { fontLevel++; applyFont(); };
applyFont();

function clearPreview() {
  selected = null;
  $('previewSection').hidden = true;
  $('pdfFrame').removeAttribute('src');
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
  $('pdfFrame').src = url;
  $('previewSection').hidden = false;
  status(`${age}세 평가지 선택 완료`);
  $('previewSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    // getDownloadURL은 파일이 없거나 읽기 권한이 없으면 실패합니다.
    // 전체 목록 조회 권한 없이도 지정한 9개 파일을 확인할 수 있습니다.
    const results = await Promise.all(ages.map(async age => {
      try {
        const url = await getDownloadURL(ref(storage, `evaluation-pdfs/age-${age}.pdf`));
        return { age, url };
      } catch (error) {
        console.warn(`${age}세 PDF 확인 실패`, error.code || error);
        return { age, url: null, error };
      }
    }));
    if (run !== generation) return;
    let ready = 0;
    let denied = 0;
    for (const item of results) {
      if (item.url) { urls.set(item.age, item.url); ready++; }
      else if (item.error?.code === 'storage/unauthorized') denied++;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'age-card';
      button.dataset.age = String(item.age);
      button.disabled = !item.url;
      button.setAttribute('aria-pressed', 'false');
      const title = document.createElement('strong');
      title.textContent = `${item.age}세`;
      const caption = document.createElement('small');
      caption.textContent = item.url ? '미리보기 · 인쇄' : '준비 중';
      button.append(title, caption);
      button.onclick = () => chooseAge(item.age);
      grid.append(button);
    }
    if (denied) status(`PDF ${ready}개 준비됨 · 일부 파일은 Storage 읽기 권한 확인이 필요합니다.`);
    else status(`PDF ${ready}개 준비됨 · 나이를 선택하세요.`);
  } catch (error) {
    console.error(error);
    status('PDF 목록 확인 중 오류가 발생했습니다.');
  } finally {
    if (run === generation) $('reload').disabled = false;
  }
}

$('reload').onclick = reload;
$('open').onclick = () => { if (selected) window.open(selected.url, '_blank', 'noopener'); };
$('print').onclick = () => {
  if (!selected) return;
  // Firebase 다운로드 URL을 브라우저 PDF 뷰어에서 열어 인쇄합니다.
  // 자동 인쇄는 브라우저/휴대폰마다 차단될 수 있습니다.
  window.open(selected.url, '_blank', 'noopener');
  status('열린 PDF의 인쇄 버튼을 눌러주세요.');
};
$('logoutBtn').onclick = async () => {
  try { await signOut(auth); location.href = 'index.html'; }
  catch (error) { console.error(error); status('로그아웃에 실패했습니다.'); }
};

// 기존 users/{uid} 승인 및 관리자 확인을 그대로 유지합니다.
onAuthStateChanged(auth, async user => {
  const run = ++generation;
  approved = false;
  clearPreview();
  urls.clear();
  $('adminLink').hidden = true;
  $('reload').disabled = true;
  if (!user) { location.href = 'index.html'; return; }
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
