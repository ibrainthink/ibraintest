// ============================================================
// 평가 설명 엔진 — 육각형(평가1) 6개 영역 점수를 바탕으로
// [나이][영역][점수] 문구를 eval-explain-data.json에서 찾아 표시한다.
// 그래프/점수 저장 로직은 전혀 건드리지 않는다 (읽기 전용으로만 사용).
// ============================================================

let EVAL_DATA = null;
let loadingPromise = null;

export function loadEvalData() {
  if (EVAL_DATA) return Promise.resolve(EVAL_DATA);
  if (!loadingPromise) {
    loadingPromise = fetch("./eval-explain-data.json")
      .then((res) => res.json())
      .then((json) => { EVAL_DATA = json; return json; })
      .catch((err) => { console.error("평가 설명 데이터를 불러오지 못했습니다.", err); return null; });
  }
  return loadingPromise;
}

// 내부 키 <-> JSON 데이터의 영역 라벨 매핑 (그래프 CATEGORIES의 key와 동일한 값 사용)
const DOMAIN_LABEL_MAP = {
  su: "수 영역",
  space: "공간·도형",
  logic: "규칙 추론",
  observe: "관찰·분류",
  problem: "문제 해결력",
  language: "언어 표현력",
};
const DOMAIN_SHORT_LABEL = {
  su: "수", space: "공간·도형", logic: "규칙·추론",
  observe: "관찰·분류", problem: "문제해결력", language: "언어·표현력",
};
const DOMAIN_ORDER = ["su", "space", "logic", "observe", "problem", "language"];

function clampAge(age) {
  if (!Number.isFinite(age)) return null;
  return Math.min(12, Math.max(5, Math.round(age)));
}

// 생년월일 + 평가일(없으면 오늘)로 나이 계산
// 주의: "만 나이"가 아니라 학원에서 반을 나눌 때 쓰는 "연 나이"(평가일 연도 - 출생 연도) 기준.
// 즉 생일이 지났는지는 따지지 않고, 같은 해에 태어났으면 같은 나이로 계산한다.
export function calcAgeFromBirthdate(birthdateStr, refDateStr) {
  if (!birthdateStr) return null;
  const bd = new Date(birthdateStr);
  if (isNaN(bd)) return null;
  const ref = refDateStr ? new Date(refDateStr) : new Date();
  if (isNaN(ref)) return null;
  return ref.getFullYear() - bd.getFullYear();
}

// 생년월일 우선, 없으면 "연령대" 텍스트에서 숫자를 추출 (예: "7세" -> 7)
export function guessAge(ageGroupText, birthdateStr, testDateStr) {
  const fromBirth = calcAgeFromBirthdate(birthdateStr, testDateStr);
  if (fromBirth != null) return clampAge(fromBirth);
  if (ageGroupText) {
    const m = String(ageGroupText).match(/\d+/);
    if (m) return clampAge(Number(m[0]));
  }
  return null;
}

function recBucket(score) {
  if (score <= 2) return "0-2";
  if (score === 3) return "3";
  return "4-5";
}

// 영역 하나에 대한 설명 + 추천 활동
export function getDomainExplain(age, domainKey, score) {
  if (!EVAL_DATA) return null;
  const label = DOMAIN_LABEL_MAP[domainKey];
  const a = clampAge(age) || 8;
  const s = Math.min(5, Math.max(0, Math.round(Number(score) || 0)));
  const ageBlock = EVAL_DATA.domain_evaluations[String(a)];
  const text = ageBlock && ageBlock[label] ? ageBlock[label][String(s)] : null;
  const activities = (EVAL_DATA.recommendations[label] && EVAL_DATA.recommendations[label][recBucket(s)]) || [];
  return { label: DOMAIN_SHORT_LABEL[domainKey], text, activities, score: s };
}

function ruleMatches(id, s) {
  switch (id) {
    case "logic_number_pattern": return s.su >= 4 && s.logic >= 4;
    case "visual_strength": return s.space >= 4 && s.observe >= 4;
    case "problem_solving_strength": return s.problem >= 4;
    case "verbal_bridge": return s.language <= 2 && DOMAIN_ORDER.some((k) => k !== "language" && s[k] >= 4);
    case "balanced": { const v = DOMAIN_ORDER.map((k) => s[k]); return Math.max(...v) - Math.min(...v) <= 1; }
    case "contrast": { const v = DOMAIN_ORDER.map((k) => s[k]); return Math.max(...v) - Math.min(...v) >= 2; }
    case "uncertain": return DOMAIN_ORDER.some((k) => s[k] === 0);
    default: return false;
  }
}

// 6개 영역 점수 전체로 종합 평가 생성 (문구 조합 방식, 점수조합을 일일이 저장하지 않음)
export function generateOverall(scores) {
  if (!EVAL_DATA) return null;
  const s = {};
  DOMAIN_ORDER.forEach((k) => { s[k] = Math.round(Number(scores[k]) || 0); });
  const withScores = DOMAIN_ORDER.map((k) => ({ key: k, label: DOMAIN_SHORT_LABEL[k], score: s[k] }));

  const strengths = withScores.filter((d) => d.score >= 4).sort((a, b) => b.score - a.score).slice(0, 2);
  const growth = withScores.filter((d) => d.score <= 2).sort((a, b) => a.score - b.score).slice(0, 2);

  const notes = [];
  EVAL_DATA.profile_rules.forEach((rule) => {
    if (ruleMatches(rule.id, s) && !notes.includes(rule.text)) notes.push(rule.text);
  });

  const activitySet = [];
  const pushActivities = (key) => {
    const label = DOMAIN_LABEL_MAP[key];
    const bucket = EVAL_DATA.recommendations[label];
    if (!bucket) return;
    const list = bucket[recBucket(s[key])] || [];
    list.slice(0, 2).forEach((a) => { if (!activitySet.includes(a)) activitySet.push(a); });
  };
  const growthKeys = growth.length ? growth : withScores.slice().sort((a, b) => a.score - b.score).slice(0, 2);
  growthKeys.forEach((d) => pushActivities(d.key));
  if (strengths.length) pushActivities(strengths[0].key);

  let direction;
  if (growth.length && strengths.length) {
    direction = `${growth.map((d) => d.label).join("·")} 영역의 활동을 중심으로 진행하되, ${strengths.map((d) => d.label).join("·")} 영역의 강점을 연결 활동으로 함께 활용하는 방향을 추천합니다.`;
  } else if (growth.length) {
    direction = `${growth.map((d) => d.label).join("·")} 영역의 활동을 중심으로 다양한 사고 경험을 넓혀가는 방향을 추천합니다.`;
  } else if (strengths.length) {
    direction = `${strengths.map((d) => d.label).join("·")} 영역의 강점을 살려 더 복합적인 활동으로 확장하는 방향을 추천합니다.`;
  } else {
    direction = "전반적으로 고른 활동을 유지하면서 다양한 사고 경험을 폭넓게 넓혀가는 방향을 추천합니다.";
  }

  return {
    title: EVAL_DATA.overall_template.title,
    note: EVAL_DATA.note,
    strengths, growth, notes, activities: activitySet, direction,
  };
}
