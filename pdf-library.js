import { app, auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { getStorage, ref, list, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js';
import { DOMAINS, classifyFilename } from './pdf-catalog.js';

const storage = getStorage(app);
const $ = id => document.getElementById(id);
let catalog = [], groups = [], selectedFiles = [], approved = false, generation = 0;
let activeUrl = '', activeName = '';
let fontLevel = Number(localStorage.getItem('iBrainFontLevel') || 0);

const option = (s,v,l) => { const o=document.createElement('option'); o.value=v; o.textContent=l; s.append(o); };
const setStatus = t => { $('status').textContent=t; };

function applyFont() {
  fontLevel = Math.max(-2, Math.min(5, fontLevel));
  const scale = 1 + fontLevel * .1;
  document.documentElement.style.setProperty('--library-scale', String(scale));
  $('fontLabel').textContent = Math.round(scale * 100) + '%';
  localStorage.setItem('iBrainFontLevel', String(fontLevel));
}
$('fontDown').onclick=()=>{fontLevel--;applyFont();};
$('fontUp').onclick=()=>{fontLevel++;applyFont();};
applyFont();

function errorMessage(e){
  console.error('문제자료실',e);
  if(e?.code==='storage/unauthorized') return '자료 접근 권한이 없습니다. Storage 규칙을 확인해 주세요.';
  if(e?.code==='storage/object-not-found') return '파일이 삭제되었거나 이동되었습니다.';
  return '자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

async function scan(folder,res,run){
  let token;
  do{
    const page=await list(folder,{maxResults:100,...(token?{pageToken:token}:{})});
    if(run!==generation)return;
    for(const item of page.items){
      if(/\.pdf$/i.test(item.name)) res.push({ref:item,name:item.name,...classifyFilename(item.name)});
    }
    for(const prefix of page.prefixes) await scan(prefix,res,run);
    token=page.nextPageToken;
  }while(token&&run===generation);
}

function fillStars(){
  const s=$('stars'), d=$('domain').value;
  s.replaceChildren(); option(s,'','난이도 선택');
  $('qty').replaceChildren(); option($('qty'),'','개수 선택');
  $('qty').disabled=true; $('addSet').disabled=true;
  if(!d){s.disabled=true;return;}
  const levels=[...new Set(catalog.filter(f=>f.domain===d).map(f=>f.stars??'unknown'))]
    .sort((a,b)=>a==='unknown'?1:b==='unknown'?-1:a-b);
  levels.forEach(n=>option(s,String(n),n==='unknown'?'난이도 미분류':'★'.repeat(Number(n))));
  s.disabled=false;
}

function fillQty(){
  const d=$('domain').value,s=$('stars').value,q=$('qty');
  q.replaceChildren(); option(q,'','개수 선택');
  if(!d||!s){q.disabled=true;$('addSet').disabled=true;return;}
  const n=catalog.filter(f=>f.domain===d&&String(f.stars??'unknown')===s).length;
  for(let i=1;i<=Math.min(20,n);i++) option(q,String(i),i+'개');
  q.disabled=!n; $('addSet').disabled=true;
}
$('qty').onchange=()=>{$('addSet').disabled=!$('qty').value;};

function shuffle(a){
  a=[...a];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}

function rebuild(){
  const used=new Set(); selectedFiles=[];
  for(const g of groups){
    const picked=shuffle(catalog.filter(f=>f.domain===g.domain&&String(f.stars??'unknown')===g.stars&&!used.has(f.name))).slice(0,g.count);
    picked.forEach(f=>{used.add(f.name);selectedFiles.push(f);});
    g.actual=picked.length;
  }
  clearPreview();
  render();
}

function clearPreview(){
  activeUrl=''; activeName='';
  $('preview').hidden=true; $('preview').removeAttribute('src');
  $('selected').textContent='문제 구성을 만든 뒤 미리보기를 눌러주세요.';
  $('open').disabled=true; $('print').disabled=!selectedFiles.length;
}

function render(){
  const b=$('bundle'); b.replaceChildren();
  $('totalCount').textContent='총 '+selectedFiles.length+'개';
  if(!groups.length){
    b.innerHTML='<p class="empty">위에서 영역·난이도·개수를 선택해 추가하세요.</p>';
  }else{
    groups.forEach(g=>{
      const x=document.createElement('div'); x.className='bundle-chip';
      x.append(document.createTextNode(g.domain+' · '+(g.stars==='unknown'?'미분류':'★'.repeat(Number(g.stars)))+' · '+(g.actual??g.count)+'개'));
      const z=document.createElement('button'); z.type='button'; z.textContent='×';
      z.onclick=()=>{groups=groups.filter(v=>v!==g);rebuild();};
      x.append(z); b.append(x);
    });
  }
  const disabled=!groups.length;
  $('clearBundle').disabled=disabled; $('reroll').disabled=disabled; $('makePreview').disabled=disabled;

  const p=$('previewList'); p.replaceChildren();
  if(!selectedFiles.length){
    p.innerHTML='<p class="empty">아직 선택된 문제가 없습니다.</p>';
  }else{
    selectedFiles.forEach((f,i)=>{
      const btn=document.createElement('button');
      btn.type='button'; btn.className='preview-item';
      btn.textContent=(i+1)+'. '+f.name;
      btn.onclick=()=>showFile(f,btn);
      p.append(btn);
    });
  }
  $('print').disabled=!selectedFiles.length;
}

async function showFile(file,button){
  $('previewList').querySelectorAll('.preview-item').forEach(x=>x.classList.remove('active'));
  if(button)button.classList.add('active');
  $('selected').textContent=file.name+' · 불러오는 중…';
  try{
    const url=await getDownloadURL(file.ref);
    activeUrl=url; activeName=file.name;
    $('preview').src=url; $('preview').hidden=false;
    $('selected').textContent=file.name;
    $('open').disabled=false;
    setStatus('미리보기 준비 완료');
    $('preview').scrollIntoView({behavior:'smooth',block:'nearest'});
  }catch(e){
    $('selected').textContent=errorMessage(e);
  }
}

async function makePreview(){
  if(!selectedFiles.length)return;
  const first=$('previewList').querySelector('.preview-item');
  await showFile(selectedFiles[0],first);
}

async function printAll(){
  if(!selectedFiles.length)return;
  setStatus('인쇄 목록을 준비하는 중…');
  try{
    const rows=[];
    for(let i=0;i<selectedFiles.length;i++){
      const f=selectedFiles[i], url=await getDownloadURL(f.ref);
      rows.push({name:f.name,url});
    }
    const w=window.open('','_blank');
    if(!w){setStatus('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.');return;}
    const esc=s=>String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>iBrain 문제 인쇄</title>
    <style>body{font-family:Arial,sans-serif;margin:0;padding:20px;color:#1b2f4b;background:#f8fafc}.wrap{max-width:800px;margin:auto}h1{font-size:25px}.note{background:#fff;padding:14px;border-radius:10px;margin-bottom:14px}.item{display:flex;gap:10px;align-items:center;background:#fff;border:1px solid #d7e0ea;border-radius:10px;padding:12px;margin:8px 0}.item span{flex:1;overflow-wrap:anywhere}.item a{background:#20395e;color:#fff;text-decoration:none;padding:9px 12px;border-radius:8px;font-weight:700}</style></head><body><div class="wrap"><h1>선택한 문제 ${rows.length}개</h1><div class="note">각 PDF의 <b>열기 / 인쇄</b>를 눌러 인쇄하세요.</div>${rows.map((r,i)=>`<div class="item"><span>${i+1}. ${esc(r.name)}</span><a href="${r.url}" target="_blank" rel="noopener">열기 / 인쇄</a></div>`).join('')}</div></body></html>`);
    w.document.close(); setStatus('인쇄 목록 준비 완료');
  }catch(e){setStatus(errorMessage(e));}
}

async function reload(){
  if(!approved)return;
  const run=++generation; $('reload').disabled=true; setStatus('PDF 목록을 불러오는 중…');
  try{
    const found=[]; await scan(ref(storage,'evaluation-pdfs'),found,run);
    if(run!==generation)return;
    catalog=found.sort((a,b)=>a.name.localeCompare(b.name,'ko',{numeric:true}));
    const d=$('domain'); d.replaceChildren(); option(d,'','영역 선택');
    [...DOMAINS.map(x=>x.label),'미분류'].filter(x=>catalog.some(f=>f.domain===x)).forEach(x=>option(d,x,x));
    d.disabled=false; fillStars();
    const unknown=catalog.filter(f=>f.domain==='미분류'||f.stars==null).length;
    setStatus(`PDF ${catalog.length}개 불러옴${unknown?` · 분류 확인 필요 ${unknown}개`:''}`);
  }catch(e){if(run===generation)setStatus(errorMessage(e));}
  finally{if(run===generation)$('reload').disabled=false;}
}

$('domain').onchange=fillStars;
$('stars').onchange=fillQty;
$('addSet').onclick=()=>{
  const d=$('domain').value,s=$('stars').value,n=Number($('qty').value);
  if(d&&s&&n){groups.push({domain:d,stars:s,count:n});rebuild();setStatus('선택 완료 · 총 '+selectedFiles.length+'개');}
};
$('clearBundle').onclick=()=>{groups=[];selectedFiles=[];rebuild();setStatus('선택한 문제를 모두 비웠습니다.');};
$('reroll').onclick=()=>{rebuild();setStatus('다시 뽑았습니다 · 총 '+selectedFiles.length+'개');};
$('makePreview').onclick=makePreview;
$('open').onclick=()=>{if(activeUrl)window.open(activeUrl,'_blank','noopener');};
$('print').onclick=printAll;
$('reload').onclick=reload;
$('logoutBtn').onclick=()=>signOut(auth).then(()=>location.href='index.html');

onAuthStateChanged(auth,async user=>{
  const run=++generation; approved=false; $('adminLink').hidden=true;
  if(!user){location.href='index.html';return;}
  try{
    const a=await getDoc(doc(db,'users',user.uid));
    if(run!==generation)return;
    if(!a.exists()||a.data().approved!==true){await signOut(auth);return;}
    approved=true; $('userEmail').textContent=user.email||''; $('adminLink').hidden=!a.data().isAdmin;
    await reload();
  }catch(e){if(run===generation)setStatus(errorMessage(e));}
});
