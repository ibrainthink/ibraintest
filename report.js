import {auth,db} from './firebase-config.js';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import {doc,getDoc} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import {CATEGORIES,CATEGORIES_2,renderHexagonChart,renderPentagonChart} from './hexagon-chart.js';
import {loadEvalData,guessAge,getDomainExplain,generateOverall} from './eval-explain.js';
import {loadEval2Data,getDomain2Explain,generateOverall2,generateFinalSummary} from './eval2-explain.js';

const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const studentId=params.get('student');
const evalId=params.get('eval');
const status=message=>{$('status').textContent=message};
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cleanText=value=>String(value??'').replace(/(?:진단평가|진단 평가|테스트|시험|검사)/g,'확인');
const scoreValue=value=>value==null||value===''?'—':Number(value).toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
function givenName(full){
  const name=String(full||'').trim().replace(/\s+/g,'');
  const doubles=['남궁','황보','제갈','선우','서문','독고','동방','사공','소봉','어금','망절'];
  const len=doubles.some(x=>name.startsWith(x))?2:1;
  return name.length>len?name.slice(len):name;
}
function subject(full){
  const name=givenName(full);
  if(!name)return '아이는';
  const n=name.charCodeAt(name.length-1);
  return name+(n>=0xAC00&&n<=0xD7A3&&(n-0xAC00)%28!==0?'이는':'는');
}
function reportText(value,full){
  let body=cleanText(value).trim();
  if(!body)return '';
  body=body.replace(/^(?:아이는|아이가|학생은|학생이|아동은|아동이)\s*/,'');
  for(const name of [String(full||'').trim(),givenName(full)]){
    if(!name)continue;
    for(const particle of ['이는','는','이가','가']){
      if(body.startsWith(name+particle)){body=body.slice((name+particle).length).trimStart();break}
    }
  }
  return subject(full)+' '+body;
}
const paragraph=(value,full)=>value?'<p>'+escapeHtml(reportText(value,full))+'</p>':'';
function renderTable(categories,scores,explain,flags){
  const rows=categories.map(c=>{
    const score=scores[c.key];
    if(score==null)return `<tr><td>${escapeHtml(c.label)}</td><td>—</td><td class="empty">미입력</td></tr>`;
    const info=explain(c.key,score);
    const label=info?.level?`<strong>${escapeHtml(info.level)}</strong> · `:'';
    const mastery=flags?.[c.key]?'<div class="mastery">★ 고난도 문항 우수</div>':'';
    return `<tr><td>${escapeHtml(c.label)}</td><td>${scoreValue(score)}</td><td>${label}${escapeHtml(cleanText(info?.text||'설명 자료 없음'))}${mastery}</td></tr>`;
  }).join('');
  return `<table class="result-table"><colgroup><col style="width:23%"><col style="width:12%"><col style="width:65%"></colgroup><thead><tr><th>영역</th><th>점수</th><th>영역별 분석</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function summary1(data,full){
  if(!data)return '<span class="empty">6개 영역의 점수가 모두 입력되면 표시됩니다.</span>';
  const parts=[];
  if(data.strengths?.length)parts.push(`<p><b>강점</b> ${escapeHtml(data.strengths.map(x=>x.label).join(' · '))}</p>`);
  if(data.growth?.length)parts.push(`<p><b>성장 영역</b> ${escapeHtml(data.growth.map(x=>x.label).join(' · '))}</p>`);
  for(const note of (data.notes||[]).slice(0,2))parts.push(paragraph(note,full));
  if(data.direction)parts.push(paragraph(data.direction,full));
  return parts.join('');
}
function summary2(data,full){
  if(!data)return '<span class="empty">5개 항목의 점수가 모두 입력되면 표시됩니다.</span>';
  const parts=[paragraph(data.levelText,full)];
  if(data.strengths?.length)parts.push(`<p><b>강점</b> ${escapeHtml(data.strengths.map(x=>x.label).join(' · '))}</p>`);
  if(data.growth?.length)parts.push(`<p><b>성장 영역</b> ${escapeHtml(data.growth.map(x=>x.label).join(' · '))}</p>`);
  if(data.gapNote)parts.push(paragraph(data.gapNote,full));
  if(data.direction)parts.push(paragraph(data.direction,full));
  return parts.join('');
}
function render(student,ev){
  const scores=ev.scores||{};
  const age=guessAge(ev.ageGroup,student.birthdate,ev.testDate);
  $('name').textContent=student.name||'—';
  $('age').textContent=ev.ageGroup|| (age!=null?`${age}세`:'—');
  $('date').textContent=ev.testDate||'—';
  renderHexagonChart($('chart1'),scores,{size:240});
  renderPentagonChart($('chart2'),scores,{size:240});
  $('domains1').innerHTML=renderTable(CATEGORIES,scores,(key,score)=>getDomainExplain(age,key,score),ev.advancedFlags);
  $('domains2').innerHTML=renderTable(CATEGORIES_2,scores,(key,score)=>getDomain2Explain(key,score));
  const all1=CATEGORIES.every(c=>scores[c.key]!=null);
  const all2=CATEGORIES_2.every(c=>scores[c.key]!=null);
  $('overall1').innerHTML=summary1(all1?generateOverall(scores):null,student.name);
  $('overall2').innerHTML=summary2(all2?generateOverall2(scores,scores):null,student.name);
  const final=all1&&all2?generateFinalSummary(scores,scores):null;
  $('finalSummary').innerHTML=final?paragraph(final.text,student.name):'<span class="empty">두 영역의 모든 점수가 입력되면 최종 종합 결과가 표시됩니다.</span>';
  $('printBtn').disabled=false;
  status('출력 준비 완료');
}
$('printBtn').onclick=()=>window.print();
if(!studentId||!evalId){status('학생 또는 결과 기록 주소가 없습니다.');}
else onAuthStateChanged(auth,async user=>{
  if(!user){location.replace('index.html');return;}
  try{
    const [u,s]=await Promise.all([getDoc(doc(db,'users',user.uid)),getDoc(doc(db,'students',studentId))]);
    if(!u.exists()||u.data().approved!==true)throw new Error('승인된 회원만 사용할 수 있습니다.');
    if(!s.exists()||s.data().createdBy!==user.uid)throw new Error('해당 학생의 열람 권한이 없습니다.');
    const e=await getDoc(doc(db,'students',studentId,'evaluations',evalId));
    if(!e.exists())throw new Error('저장된 결과 기록이 없습니다.');
    await Promise.all([loadEvalData(),loadEval2Data()]);
    render(s.data(),e.data());
  }catch(error){console.error(error);status(error.message||'결과를 불러오지 못했습니다.');}
});
