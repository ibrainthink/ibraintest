// ============================================================
// 평가1 '고난도 문항' 기능
// - 일반 문항 평균은 기존 scores 필드로 그대로 저장/사용 (hexagon-chart.js, eval-explain.js 무수정)
// - 고난도 문항 점수/월등 여부는 별도 필드(advancedScores, advancedFlags)로 관리
// - 그래프는 기존 renderHexagonChart 위에 "오버레이"로 월등 표시만 추가 (기존 렌더링 함수 무수정)
// ============================================================

// 월등 표시를 위한 확장 배율 — 나중에 1.10~1.15 등으로 쉽게 조정 가능
export const ADVANCED_GRAPH_MULTIPLIER = 1.12;

// 영역별 일반 문항 개수(기본 3개). 실제 문제지가 정해지면 이 숫자만 조정하면 됨.
export const NORMAL_ITEM_COUNT = 3;

// 고난도 문항에서 '월등' 판정을 내리는 기준 점수
export const ADVANCED_MASTERY_THRESHOLD = 5;

/**
 * 일반 문항 점수 배열(미입력은 null/undefined)로 평균을 계산한다.
 * 미입력 항목은 0점으로 취급하지 않고 계산에서 제외한다.
 * @returns {{ average: number|null, answeredCount: number, total: number }}
 */
export function computeNormalAverage(itemScores) {
  const list = Array.isArray(itemScores) ? itemScores : [];
  const answered = list.filter((v) => v != null && v !== "");
  const total = list.length || NORMAL_ITEM_COUNT;
  if (answered.length === 0) return { average: null, answeredCount: 0, total };
  const sum = answered.reduce((s, v) => s + Number(v), 0);
  return { average: sum / answered.length, answeredCount: answered.length, total };
}

/**
 * 고난도 문항 점수로 '월등' 여부를 판정한다.
 * 미입력이면 월등 판정을 내리지 않는다(null 반환).
 */
export function computeAdvancedFlag(advancedScore) {
  if (advancedScore == null || advancedScore === "") return false;
  return Number(advancedScore) >= ADVANCED_MASTERY_THRESHOLD;
}

/**
 * 육각형(또는 N각형) 그래프 위에, 월등 판정된 영역의 꼭짓점만
 * 5점 외곽보다 살짝 바깥쪽(기본 12%)으로 별 모양 표시를 덧그린다.
 * 기존 renderHexagonChart가 그린 SVG는 전혀 건드리지 않고,
 * 같은 좌표계로 계산한 별도의 오버레이 SVG를 그 위에 얹는 방식이다.
 *
 * @param {SVGElement} overlaySvg  base 차트와 정확히 같은 크기로 겹쳐진 <svg> 엘리먼트
 * @param {Array<{key:string,label:string}>} categories  base 차트와 동일한 categories 배열(순서 포함)
 * @param {Object} advancedFlags  { [key]: boolean }
 * @param {Object} [options]  { size }  base 차트를 그릴 때 넘긴 size와 반드시 동일해야 함
 */
export function renderAdvancedOverlay(overlaySvg, categories, advancedFlags, options = {}) {
  if (!overlaySvg) return;
  const size = options.size || 300;
  const center = size / 2;
  const maxR = size * 0.34;
  const pad = 46;
  const n = categories.length;

  function pointAt(index, ratio) {
    const angle = (Math.PI / 180) * (-90 + index * (360 / n));
    const r = maxR * ratio;
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)];
  }

  function starPath(cx, cy, outerR, innerR) {
    let d = "";
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI / 180) * (-90 + i * 36);
      const r = i % 2 === 0 ? outerR : innerR;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      d += (i === 0 ? "M" : "L") + x.toFixed(2) + "," + y.toFixed(2);
    }
    return d + "Z";
  }

  const viewSize = size + pad;
  overlaySvg.setAttribute("viewBox", `0 0 ${viewSize} ${viewSize}`);

  let marks = "";
  categories.forEach((c, i) => {
    if (!advancedFlags[c.key]) return;
    const [x, y] = pointAt(i, ADVANCED_GRAPH_MULTIPLIER);
    marks += `<path d="${starPath(x, y, 9, 4)}" class="advanced-star"><title>${c.label}: 고난도 월등</title></path>`;
  });

  overlaySvg.innerHTML = `<g transform="translate(${pad / 2}, ${pad / 2})">${marks}</g>`;
}
