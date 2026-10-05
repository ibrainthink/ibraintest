import { db } from "./firebase-config.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, where, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const studentsCol = collection(db, "students");

/* 학생목록/평가 화면 공통 글씨 크기 조절창.
   기존 dashboard.html을 수정하지 않아도 이 모듈이 로드되면 자동으로 표시됩니다. */
(function installFontControl(){
  if (document.getElementById("iBrainGlobalFontControl")) return;
  let level = Number(localStorage.getItem("iBrainFontLevel") || 0);
  const style = document.createElement("style");
  style.textContent = `
    :root{--ibrain-user-scale:1}
    body{font-size:calc(15px * var(--ibrain-user-scale))!important}
    .main,.modal-box{font-size:1em}
    .student-card .name{font-size:1.14em!important}
    .student-card .meta,.field label,.eval-history-item .age,.count{font-size:.9em!important}
    .modal-head h3{font-size:1.23em!important}
    .eval-history-item,.section-title{font-size:1em!important}
    #iBrainGlobalFontControl{position:fixed;right:12px;top:10px;z-index:1000;display:flex;align-items:center;gap:5px;background:#1b2f4b;color:#fff;border-radius:12px;padding:6px 8px;box-shadow:0 3px 12px #0002}
    #iBrainGlobalFontControl span{font-size:13px;font-weight:700;white-space:nowrap}
    #iBrainGlobalFontControl button{width:38px;height:38px;border:1px solid #ffffff80;background:transparent;color:#fff;border-radius:9px;font-size:20px;font-weight:800;padding:0}
    @media(max-width:700px){
      #iBrainGlobalFontControl{right:8px;top:8px}
      #iBrainGlobalFontControl .word{display:none}
      .app-shell{display:block!important;min-height:100vh!important}
      .sidebar{width:100%!important;height:auto!important;min-height:0!important;padding:10px 12px 8px!important;display:grid!important;grid-template-columns:auto 1fr!important;align-items:center!important;gap:4px 12px!important;position:relative!important}
      .sidebar .brand{margin:0!important;font-size:16px!important}
      .sidebar .brand-sub{display:none!important}
      .sidebar nav{grid-column:1/-1!important;display:flex!important;flex-direction:row!important;gap:5px!important;overflow-x:auto!important;margin-top:4px!important}
      .sidebar nav a{flex:0 0 auto!important;padding:8px 11px!important;font-size:14px!important;white-space:nowrap!important}
      .sidebar .spacer,.sidebar .user-email,.sidebar .logout-btn{display:none!important}
      .main{width:100%!important;max-width:none!important;padding:20px 14px 40px!important}
      .page-head{align-items:center!important;gap:10px!important}
      .page-head h2{font-size:22px!important;white-space:nowrap!important}
      .page-head .btn-accent{white-space:nowrap!important;padding:10px 14px!important}
      .search-row{max-width:none!important;width:100%!important}
      .student-grid{grid-template-columns:1fr!important}
      .student-card{width:100%!important}
    }
  `;
  document.head.append(style);
  const box=document.createElement("div"); box.id="iBrainGlobalFontControl";
  box.innerHTML='<span class="word">글씨크기</span><button type="button" id="iBrainFontMinus" aria-label="글씨 작게">−</button><span id="iBrainFontPercent">100%</span><button type="button" id="iBrainFontPlus" aria-label="글씨 크게">＋</button>';
  document.body.append(box);
  function apply(){
    level=Math.max(-2,Math.min(5,level));
    const scale=1+level*.1;
    document.documentElement.style.setProperty("--ibrain-user-scale",String(scale));
    document.getElementById("iBrainFontPercent").textContent=Math.round(scale*100)+"%";
    localStorage.setItem("iBrainFontLevel",String(level));
  }
  document.getElementById("iBrainFontMinus").onclick=()=>{level--;apply();};
  document.getElementById("iBrainFontPlus").onclick=()=>{level++;apply();};
  apply();
})();

export function watchStudents(uid, callback, onError) {
  if (!uid) throw new Error("로그인이 필요합니다.");
  const q = query(studentsCol, where("createdBy", "==", uid));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko"));
    callback(list);
  }, onError);
}
export async function addStudent(data, uid) {
  return addDoc(studentsCol, {name:data.name||"",birthdate:data.birthdate||"",address:data.address||"",guardianName:data.guardianName||"",phone:data.phone||"",institution:data.institution||"",createdBy:uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
}
export async function updateStudent(studentId, data) {
  return updateDoc(doc(db,"students",studentId), {name:data.name||"",birthdate:data.birthdate||"",address:data.address||"",guardianName:data.guardianName||"",phone:data.phone||"",institution:data.institution||"",updatedAt:serverTimestamp()});
}
export async function deleteStudent(studentId) { return deleteDoc(doc(db,"students",studentId)); }
export function watchEvaluations(studentId, callback) {
  const col=collection(db,"students",studentId,"evaluations");
  return onSnapshot(query(col,orderBy("testDate","desc")),(snap)=>callback(snap.docs.map(d=>({id:d.id,...d.data()}))));
}
export async function addEvaluation(studentId,data,uid) {
  return addDoc(collection(db,"students",studentId,"evaluations"),{testDate:data.testDate||"",ageGroup:data.ageGroup||"",scores:data.scores,comment:data.comment||"",normalItemScores:data.normalItemScores||{},advancedScores:data.advancedScores||{},advancedFlags:data.advancedFlags||{},createdBy:uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
}
export async function updateEvaluation(studentId,evalId,data) {
  return updateDoc(doc(db,"students",studentId,"evaluations",evalId),{testDate:data.testDate||"",ageGroup:data.ageGroup||"",scores:data.scores,comment:data.comment||"",normalItemScores:data.normalItemScores||{},advancedScores:data.advancedScores||{},advancedFlags:data.advancedFlags||{},updatedAt:serverTimestamp()});
}
export async function deleteEvaluation(studentId,evalId) { return deleteDoc(doc(db,"students",studentId,"evaluations",evalId)); }
