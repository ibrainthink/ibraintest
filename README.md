# iBrain 생각의고수 — 테스트지 평가 시스템 (1차 버전)

## 지금까지 만든 기능
- 이메일 회원가입 + 관리자 승인 로그인 (승인 전에는 대시보드 접근 불가)
- 관리자 페이지: 가입 대기자 승인/거절, 승인된 계정 목록·권한 확인
- 학생 정보 등록/수정/삭제 (이름, 생년월일, 주소, 보호자 성함, 연락처, 소속 기관)
- 평가 점수 입력 (6개 영역 × 1~5점) 및 등록/수정/삭제
- 점수 입력 시 육각그래프 실시간 자동 반영 (회색 배경 정육각형 + 진파랑 점수 그래프)
- 학생별 평가 기록(회차별) 저장 — 같은 학생이 여러 번 검사받아도 기록이 쌓임

## 아직 없는 것 (다음 업데이트에서 진행)
- 점수에 따른 자동 평가 멘트 (문구 내용을 알려주시면 반영)
- 연령대별 문항/테스트지 자체 (테스트지는 원장님이 만드시는 채점표 역할만 우선 구현)
- 평가 결과 인쇄/PDF, 학부모 공유용 화면

---

## 배포 전 준비 (계정은 기존 것 재사용 / 프로젝트는 새로 생성)

기존 "생고앱"(진도율 앱)이 쓰던 Google 계정(nabangcat@gmail.com), GitHub 계정(ibrainthink)은
그대로 재사용하되, **기존 앱을 절대 건드리지 않기 위해** 아래 항목은 완전히 새로 만듭니다.

- Firebase는 새 프로젝트 (saenggo-app과 별개) — Firestore 보안 규칙 파일이 프로젝트당 하나뿐이라,
  같은 프로젝트를 같이 쓰면 기존 진도율 앱의 규칙을 건드릴 위험이 있어 분리했습니다.
- GitHub도 새 저장소 (saengo-app과 별개 repo) — 기존 저장소 폴더 안에 같이 넣지 않고 완전히 새 repo로 분리했습니다.
- Cloudflare Pages도 새 프로젝트로 연결 (기존 saenggo-app.pages.dev와 별개 주소)

### 1. Firebase 새 프로젝트 만들기
1. https://console.firebase.google.com 접속 (nabangcat@gmail.com으로 로그인)
2. "프로젝트 추가" → 이름 예: `ibrain-hexagon-test` → 생성
3. 왼쪽 메뉴 **Authentication** → "시작하기" → 로그인 방법에서 **이메일/비밀번호** 사용 설정
4. 왼쪽 메뉴 **Firestore Database** → "데이터베이스 만들기" → 프로덕션 모드로 생성 (위치는 asia-northeast3 추천)
5. Firestore **규칙(Rules)** 탭 → 이 폴더의 `firestore.rules` 내용을 그대로 붙여넣고 게시

### 2. 웹 앱 등록 & 설정값 붙여넣기
1. 프로젝트 설정(톱니바퀴) → 아래로 스크롤 → "웹 앱 추가"(`</>` 아이콘)
2. 앱 닉네임 입력 후 등록하면 `firebaseConfig` 값이 나옵니다
3. 이 프로젝트의 `js/firebase-config.js` 파일을 열어 `YOUR_API_KEY` 등 부분을 그 값으로 교체

### 3. 첫 관리자 계정 만들기
1. 배포된 사이트(또는 로컬)에서 회원가입 화면으로 본인 계정을 하나 가입
2. Firebase 콘솔 → Firestore Database → `users` 컬렉션 → 방금 가입된 문서를 열어
   `approved`를 `true`, `isAdmin`을 `true`로 직접 수정
3. 이후부터는 이 계정으로 로그인해서 admin.html에서 다른 선생님들을 승인하면 됩니다

### 4. GitHub 새 저장소 + Cloudflare Pages 배포
1. github.com (ibrainthink 계정)에서 새 저장소 생성 — 예: `ibrain-hexagon-app`
2. 이 폴더(index.html, dashboard.html, admin.html, css/, js/, firestore.rules)를 그대로 업로드
3. Cloudflare Pages → "프로젝트 만들기" → 방금 만든 GitHub 저장소 연결 → 빌드 설정 없이 그대로 배포
   (정적 HTML이라 빌드 명령어 없이 배포 가능합니다)
4. 이후에는 GitHub에 파일을 올릴 때마다 자동으로 재배포됩니다

---

## 다음 업데이트할 때 알려주시면 좋은 것
- 평가 멘트(코멘트) 문구 — 영역별/점수별로 어떤 문장이 나가야 하는지
- 나이대별 테스트지를 앱 안에서 직접 문항으로 관리할지, 아니면 지금처럼 점수만 입력할지
