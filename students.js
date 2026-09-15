import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const studentsCol = collection(db, "students");

// ---------- 학생 정보 ----------

export function watchStudents(callback) {
  const q = query(studentsCol, orderBy("name"));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(list);
  });
}

export async function addStudent(data, uid) {
  return addDoc(studentsCol, {
    name: data.name || "",
    birthdate: data.birthdate || "",
    address: data.address || "",
    guardianName: data.guardianName || "",
    phone: data.phone || "",
    institution: data.institution || "",
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateStudent(studentId, data) {
  const ref = doc(db, "students", studentId);
  return updateDoc(ref, {
    name: data.name || "",
    birthdate: data.birthdate || "",
    address: data.address || "",
    guardianName: data.guardianName || "",
    phone: data.phone || "",
    institution: data.institution || "",
    updatedAt: serverTimestamp(),
  });
}

export async function deleteStudent(studentId) {
  const ref = doc(db, "students", studentId);
  return deleteDoc(ref);
}

// ---------- 평가 기록 (학생 하위 컬렉션) ----------

export function watchEvaluations(studentId, callback) {
  const col = collection(db, "students", studentId, "evaluations");
  const q = query(col, orderBy("testDate", "desc"));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(list);
  });
}

export async function addEvaluation(studentId, data, uid) {
  const col = collection(db, "students", studentId, "evaluations");
  return addDoc(col, {
    testDate: data.testDate || "",
    ageGroup: data.ageGroup || "",
    scores: data.scores,
    comment: data.comment || "",
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateEvaluation(studentId, evalId, data) {
  const ref = doc(db, "students", studentId, "evaluations", evalId);
  return updateDoc(ref, {
    testDate: data.testDate || "",
    ageGroup: data.ageGroup || "",
    scores: data.scores,
    comment: data.comment || "",
    updatedAt: serverTimestamp(),
  });
}

export async function deleteEvaluation(studentId, evalId) {
  const ref = doc(db, "students", studentId, "evaluations", evalId);
  return deleteDoc(ref);
}
