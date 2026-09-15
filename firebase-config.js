// ============================================================
// Firebase 프로젝트 설정
// Firebase 콘솔 > 프로젝트 설정(톱니바퀴) > 일반 탭 하단
// "내 앱" > 웹 앱(</>) 추가 후 나오는 값을 아래에 그대로 붙여넣으세요.
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCOstqlpfUPc5rZZZUxUR1KDt3FPRYTRNs",
  authDomain: "ibrain-test.firebaseapp.com",
  projectId: "ibrain-test",
  storageBucket: "ibrain-test.firebasestorage.app",
  messagingSenderId: "677983404760",
  appId: "1:677983404760:web:201c6c5f1099d358c9cdad",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
