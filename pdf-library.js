import { app, auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { getStorage, ref, list, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js';
import { DOMAINS, classifyFilename } from './pdf-catalog.js';
const storage = getStorage(app);
const $ = id => document.getElementById(id);
let catalog = [], activeUrl = null, objectUrl = null, generation = 0, selection = 0, approved = false;
function clearPreview() {
  selection++;
  activeUrl = null;
  $('preview').onload = null; $('preview').removeAttribute('src'); $('preview').hidden = true;
  if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
  $('selected').textContent = 'PDF를 선택하세요.';
  $('print').disabled = $('open').disabled = true;
}
function reset() {
  approved = false; catalog = []; clearPreview();
  ['domain','stars','search','reload'].forEach(id => $(id).disabled = true);
  $('files').replaceChildren(); $('count').textContent = '';
}
function message(error) {
  console.error('문제자료실', error);
  return error.code === 'storage/unauthorized'
    ? '자료 접근 권한이 없습니다. 관리자에게 문의해 주세요. (Storage 규칙 확인 필요)'
    : error.code === 'storage/object-not-found' ? '파일이 삭제되었거나 이동되었습니다. 목록을 새로고침하세요.'
    : '자료를 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.';
}
async function scan(folder, results, run) {
  let pageToken;
  do {
    const page = await list(folder, {maxResults: 100, ...(pageToken ? {pageToken} : {})});
    if (run !== generation) return;
    for (const item of page.items) if (/\.pdf$/i.test(item.name)) results.push({ref:item, name:item.name, ...classifyFilename(item.name)});
    for (const prefix of page.prefixes) await scan(prefix, results, run);
    pageToken = page.nextPageToken;
  } while (pageToken && run === generation);
}
function option(select, value, label) { const o = document.createElement('option'); o.value = value; o.textContent = label; select.append(o); }
async function reload() {
  if (!approved) return;
  const run = ++generation; clearPreview(); $('reload').disabled = true;
  $('domain').disabled = $('stars').disabled = $('search').disabled = true;
  catalog = []; $('files').replaceChildren(); $('count').textContent = ''; $('status').textContent = 'PDF 목록을 불러오는 중…';
  try {
    const found = []; await scan(ref(storage,'evaluation-pdfs'), found, run);
    if (run !== generation) return;
    catalog = found.sort((a,b)=>a.name.localeCompare(b.name,'ko',{numeric:true}));
    $('domain').replaceChildren(); option($('domain'),'','영역 선택');
    [...DOMAINS.map(d=>d.label),'미분류'].filter(d=>catalog.some(f=>f.domain===d)).forEach(d=>option($('domain'),d,d));
    $('stars').replaceChildren(); option($('stars'),'','난이도 선택');
    $('search').value = '';
    const unknown = catalog.filter(f=>f.domain==='미분류'||f.stars==null).length;
    $('status').textContent = `PDF ${catalog.length}개${unknown ? ` · 분류 확인 필요 ${unknown}개 (미분류/난이도 미분류에서 확인)` : ''}`;
    $('domain').disabled = $('search').disabled = false; render();
  } catch (e) { if (run===generation) $('status').textContent = message(e); }
  finally { if(run===generation) $('reload').disabled = false; }
}
function render() {
  clearPreview(); $('files').replaceChildren();
  const domain=$('domain').value, stars=$('stars').value, term=$('search').value.trim().toLowerCase();
  if(!domain || !stars) { $('count').textContent = domain ? '별 난이도를 선택하세요.' : '영역을 선택하세요.'; return; }
  const filtered=catalog.filter(f=>f.domain===domain && String(f.stars ?? 'unknown')===stars && f.name.toLowerCase().includes(term));
  $('count').textContent=`${filtered.length}개`;
  if(!filtered.length) { $('files').textContent='해당하는 PDF가 없습니다.'; return; }
  for(const file of filtered) {
    const button=document.createElement('button'); button.className='pdf-file'; button.setAttribute('aria-pressed','false');
    button.textContent=file.name;
    button.onclick=()=>preview(file,button); $('files').append(button);
  }
}
async function preview(file, button) {
  clearPreview(); const ticket=selection, run=generation;
  $('files').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  $('selected').textContent=`${file.name} · 불러오는 중…`;
  try {
    const url=await getDownloadURL(file.ref);
    if(ticket!==selection || run!==generation || !approved) return;
    activeUrl=url;
    $('preview').src=url; $('preview').hidden=false;
    $('selected').textContent=file.name;
    $('open').disabled=$('print').disabled=false;
  } catch(e) { if(ticket===selection && run===generation) $('selected').textContent=message(e); }
}
$('domain').onchange=()=>{
  $('stars').replaceChildren(); option($('stars'),'','난이도 선택');
  const levels=[...new Set(catalog.filter(f=>f.domain===$('domain').value).map(f=>f.stars ?? 'unknown'))].sort((a,b)=>a==='unknown'?1:b==='unknown'?-1:a-b);
  levels.forEach(n=>option($('stars'),String(n),n==='unknown'?'난이도 미분류':'★'.repeat(n)));
  $('stars').disabled=!$('domain').value; render();
};
$('stars').onchange=render; $('search').oninput=render; $('reload').onclick=reload;
$('open').onclick=()=>{if(activeUrl) window.open(activeUrl,'_blank','noopener');};
// 브라우저의 PDF 뷰어는 교차 출처이므로 print() 호출이 차단될 수 있습니다.
// CORS가 허용된 경우 같은 출처 Blob으로 전환하고, 실패하면 PDF 뷰어를 엽니다.
$('print').onclick=async()=>{
  if(!activeUrl) return;
  const url=activeUrl, ticket=selection;
  $('print').disabled=true;
  try {
    const response=await fetch(url);
    if(!response.ok) throw new Error('PDF 다운로드 실패');
    const blob=await response.blob();
    if(ticket!==selection || !approved) return;
    if(objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl=URL.createObjectURL(new Blob([blob],{type:'application/pdf'}));
    const frame=$('preview');
    frame.onload=()=>{
      frame.onload=null;
      if(ticket!==selection || !approved) return;
      try {frame.contentWindow.focus(); frame.contentWindow.print();}
      catch { $('selected').textContent+=' · PDF 뷰어의 인쇄 버튼을 눌러주세요.'; }
    };
    frame.src=objectUrl;
    $('selected').textContent+=' · 인쇄창이 뜨지 않으면 PDF 뷰어의 인쇄 버튼 또는 새 창 열기를 이용하세요.';
  } catch(e) {
    if(ticket!==selection || !approved) return;
    $('selected').textContent+=' · 이 기기에서는 새 창에서 PDF를 열어 인쇄해 주세요.';
    window.open(url,'_blank','noopener');
  } finally { if(ticket===selection && approved) $('print').disabled=false; }
};
$('logoutBtn').onclick=()=>signOut(auth).then(()=>location.href='index.html');
onAuthStateChanged(auth,async user=>{
  const run=++generation; reset(); $('adminLink').hidden=true;
  if(!user) {location.href='index.html';return;}
  try {
    const account=await getDoc(doc(db,'users',user.uid));
    if(run!==generation) return;
    if(!account.exists() || account.data().approved!==true) {await signOut(auth);return;}
    approved=true; $('userEmail').textContent=user.email || '';
    $('adminLink').hidden=!account.data().isAdmin;
    await reload();
  } catch(e) {if(run===generation) $('status').textContent=message(e);}
});
window.addEventListener('pagehide',()=>{if(objectUrl) URL.revokeObjectURL(objectUrl);});
