// ============================================================
// 평가2(이해도·흥미·태도·성취 수준·창의성) 설명 엔진
// 평가1(hexagon-chart.js, eval-explain.js, eval-explain-data.json)은
// 이 파일에서 전혀 수정하거나 가져오지 않는다 — 완전히 독립적으로 동작.
// ============================================================

let EVAL2_DATA = null;
let loadingPromise = null;

export function loadEval2Data() {
  if (EVAL2_DATA) return Promise.resolve(EVAL2_DATA);
  if (!loadingPromise) {
    loadingPromise = fetch("./eval2-explain-data.json")
      .then((res) => res.json())
      .then((json) => { EVAL2_DATA = json; return json; })
      .catch((err) => { console.error("평가2 설명 데이터를 불러오지 못했습니다.", err); return null; });
  }
  return loadingPromise;
}

// 평가2 전용 5단계 답변 (1~5, 0점 없음)
export const SCALE_LABELS_2 = [
  { score: 1, label: "관찰 필요" },
  { score: 2, label: "경험 필요" },
  { score: 3, label: "보통" },
  { score: 4, label: "높음" },
  { score: 5, label: "매우 높음" },
];

export const DOMAIN_ORDER_2 = ["understand", "interest", "attitude", "achieve", "creative"];
const DOMAIN_LABEL_MAP_2 = {
  understand: "이해도", interest: "흥미", attitude: "태도", achieve: "성취 수준", creative: "창의성",
};

function clampScore(v) {
  return Math.min(5, Math.max(1, Math.round(Number(v) || 0)));
}

// 영역 하나에 대한 설명 (레벨명 + 문구)
export function getDomain2Explain(domainKey, score) {
  if (!EVAL2_DATA) return null;
  const label = DOMAIN_LABEL_MAP_2[domainKey];
  const s = clampScore(score);
  const entry = EVAL2_DATA.domain_evaluations[label] && EVAL2_DATA.domain_evaluations[label][String(s)];
  if (!entry) return null;
  return { label, score: s, level: entry.level, text: entry.text };
}

function ruleMatches(id, s2, problemScore1) {
  switch (id) {
    case "understand_achieve_high": return s2.understand >= 4 && s2.achieve >= 4;
    case "understand_achieve_gap": return s2.understand >= 4 && s2.achieve <= 2;
    case "interest_attitude_high": return s2.interest >= 4 && s2.attitude >= 4;
    case "interest_attitude_gap": return s2.interest >= 4 && s2.attitude <= 2;
    case "creative_problem_solving": return s2.creative >= 4 && (problemScore1 || 0) >= 4;
    case "creative_understand_gap": return s2.creative >= 4 && s2.understand <= 2;
    case "all_high": return DOMAIN_ORDER_2.every((k) => s2[k] >= 4);
    case "all_mid": return DOMAIN_ORDER_2.every((k) => s2[k] === 3);
    case "low_multiple": return DOMAIN_ORDER_2.filter((k) => s2[k] <= 2).length >= 2;
    default: return false;
  }
}

/**
 * 평가2 5개 영역 점수로 종합 평가 생성.
 * @param {Object} scores2  { understand, interest, attitude, achieve, creative } 각 1~5
 * @param {Object} [scores1] 평가1 점수(선택) — 창의성×문제해결력 연결 규칙에만 사용
 */
export function generateOverall2(scores2, scores1) {
  if (!EVAL2_DATA) return null;
  const s2 = {};
  DOMAIN_ORDER_2.forEach((k) => { s2[k] = clampScore(scores2[k]); });
  const problemScore1 = scores1 ? Number(scores1.problem) || 0 : 0;

  const withScores = DOMAIN_ORDER_2.map((k) => ({ key: k, label: DOMAIN_LABEL_MAP_2[k], score: s2[k] }));
  const strengths = withScores.filter((d) => d.score >= 4).sort((a, b) => b.score - a.score).slice(0, 2);
  const growth = withScores.filter((d) => d.score <= 2).sort((a, b) => a.score - b.score).slice(0, 2);

  const notes = [];
  EVAL2_DATA.profile_rules.forEach((rule) => {
    if (ruleMatches(rule.id, s2, problemScore1) && !notes.includes(rule.text)) notes.push(rule.text);
  });

  // 평균 기반 전체 수준 문장 (부모에게 평균 숫자를 직접 보여주지는 않음)
  const avg = DOMAIN_ORDER_2.reduce((sum, k) => sum + s2[k], 0) / DOMAIN_ORDER_2.length;
  let levelText;
  if (avg >= 4.5) levelText = "전반적으로 매우 높은 수준의 학습 특성이 나타납니다.";
  else if (avg >= 3.5) levelText = "전반적으로 높은 수준의 학습 특성이 나타납니다.";
  else if (avg >= 2.5) levelText = "전반적으로 안정적인 학습 특성이 나타납니다.";
  else if (avg >= 1.5) levelText = "경험을 통해 조금씩 확장해가면 좋은 학습 특성이 나타납니다.";
  else levelText = "이번 검사에서 확인한 모습을 바탕으로, 앞으로 다양한 활동에서 지속적으로 관찰해가면 좋겠습니다.";

  const max = Math.max(...DOMAIN_ORDER_2.map((k) => s2[k]));
  const min = Math.min(...DOMAIN_ORDER_2.map((k) => s2[k]));
  let gapNote = "";
  if (max - min >= 2) {
    const topLabels = withScores.filter((d) => d.score === max).map((d) => d.label).join("·");
    const lowLabels = withScores.filter((d) => d.score === min).map((d) => d.label).join("·");
    gapNote = `${topLabels}에 비해 ${lowLabels} 점수가 상대적으로 낮게 나타났습니다. 강점을 살려 자연스럽게 다른 영역으로 연결해볼 수 있습니다.`;
  }

  // 지도 방향
  const t = EVAL2_DATA.direction_templates;
  const directions = [];
  if (s2.understand >= 4 && s2.achieve >= 4) directions.push(t.understand_achieve);
  if (s2.interest >= 4 && s2.attitude >= 4) directions.push(t.interest_attitude);
  if (s2.creative >= 4) directions.push(t.creative);
  growth.forEach(() => { if (!directions.includes(t.low_domain)) directions.push(t.low_domain); });
  if (directions.length === 0) directions.push(t.default);

  return {
    title: EVAL2_DATA.overall_template.title,
    note: EVAL2_DATA.note,
    strengths, growth, notes, levelText, gapNote,
    direction: directions.join(" "),
  };
}

/**
 * 평가1 + 평가2를 모두 마쳤을 때 보여줄 최종 통합 종합 평가 문단.
 * 평가1(6개)·평가2(5개) 점수가 모두 있어야 호출한다.
 */
export function generateFinalSummary(scores1, scores2) {
  if (!EVAL2_DATA) return null;
  const s2 = {};
  DOMAIN_ORDER_2.forEach((k) => { s2[k] = clampScore(scores2[k]); });

  const EVAL1_LABELS = { su: "수", space: "공간·도형", logic: "규칙·추론", observe: "관찰·분류", problem: "문제해결력", language: "언어·표현력" };
  const s1 = {};
  Object.keys(EVAL1_LABELS).forEach((k) => { s1[k] = Math.round(Number(scores1[k]) || 0); });

  const allEntries = [
    ...Object.keys(EVAL1_LABELS).map((k) => ({ label: EVAL1_LABELS[k], score: s1[k] })),
    ...DOMAIN_ORDER_2.map((k) => ({ label: DOMAIN_LABEL_MAP_2[k], score: s2[k] })),
  ];
  const strengths = allEntries.filter((d) => d.score >= 4).sort((a, b) => b.score - a.score).slice(0, 2);
  const growth = allEntries.filter((d) => d.score <= 2).sort((a, b) => a.score - b.score).slice(0, 2);

  const parts = [];
  if (strengths.length) {
    parts.push(`아이는 ${strengths.map((d) => d.label).join("·")} 영역이 강점으로 나타났습니다.`);
  } else {
    parts.push("아이는 전반적으로 고르게 안정적인 모습이 나타났습니다.");
  }
  if (growth.length) {
    parts.push(`반면 ${growth.map((d) => d.label).join("·")} 영역은 아직 경험이 더 필요할 수 있으므로, 아이가 잘할 수 있는 부분에서 먼저 성공 경험을 쌓은 뒤 조금씩 복합적인 문제로 확장하는 것이 좋겠습니다.`);
  } else {
    parts.push("특별히 더 채워야 할 영역보다는, 지금의 고른 강점을 다양한 활동으로 더 넓혀가는 방향이 좋겠습니다.");
  }

  return {
    title: "🌱 종합 평가",
    text: parts.join(" "),
  };
}
