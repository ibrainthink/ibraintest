// ============================================================
// 평가 그래프 렌더링 (N각형 공용)
// 배경: 회색 정다각형 그리드(1~5점 레벨)
// 점수: 색깔 다각형으로 오버레이
// ============================================================

// 평가1 — 6개 영역 (육각형)
export const CATEGORIES = [
  { key: "su", label: "수" },
  { key: "space", label: "공간·도형" },
  { key: "logic", label: "규칙·추론" },
  { key: "observe", label: "관찰·분류" },
  { key: "problem", label: "문제해결력" },
  { key: "language", label: "언어·표현력" },
];

// 평가2 — 5개 영역 (오각형)
export const CATEGORIES_2 = [
  { key: "understand", label: "이해도" },
  { key: "interest", label: "흥미" },
  { key: "attitude", label: "태도" },
  { key: "achieve", label: "성취 수준" },
  { key: "creative", label: "창의성" },
];

// 모든 문항에 공통으로 쓰는 답변 (점수 오름차순, 0~5)
export const SCALE_LABELS = [
  { score: 0, label: "현재 확인 어려움" },
  { score: 1, label: "집중적인 경험 필요" },
  { score: 2, label: "경험 필요" },
  { score: 3, label: "발달 중" },
  { score: 4, label: "안정적" },
  { score: 5, label: "매우 안정적" },
];

/**
 * N각형 평가 그래프를 그린다.
 * @param {HTMLElement} container
 * @param {Array<{key:string,label:string}>} categories
 * @param {Object} scores  { [key]: 1~5 }
 * @param {Object} [options]  { size, colorClass }  colorClass: "navy" | "accent"
 */
export function renderRadarChart(container, categories, scores, options = {}) {
  const size = options.size || 300;
  const colorClass = options.colorClass || "navy";
  const center = size / 2;
  const maxR = size * 0.34;
  const levels = 5;
  const pad = 46;
  const n = categories.length;

  function pointAt(index, ratio) {
    const angle = (Math.PI / 180) * (-90 + index * (360 / n));
    const r = maxR * ratio;
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)];
  }

  function polygonPoints(ratioFn) {
    return categories.map((c, i) => pointAt(i, ratioFn(i)).join(",")).join(" ");
  }

  let gridPolygons = "";
  for (let lvl = 1; lvl <= levels; lvl++) {
    const ratio = lvl / levels;
    gridPolygons += `<polygon points="${polygonPoints(() => ratio)}" class="hex-grid-ring" />`;
  }

  let axisLines = "";
  let labels = "";
  let levelTicks = "";
  categories.forEach((c, i) => {
    const [x, y] = pointAt(i, 1);
    axisLines += `<line x1="${center}" y1="${center}" x2="${x}" y2="${y}" class="hex-axis-line" />`;
    const [lx, ly] = pointAt(i, 1.28);
    labels += `<text x="${lx}" y="${ly}" class="hex-label" text-anchor="middle" dominant-baseline="middle">${c.label}</text>`;
  });
  for (let lvl = 1; lvl <= levels; lvl++) {
    const [tx, ty] = pointAt(0, lvl / levels);
    levelTicks += `<text x="${tx + 10}" y="${ty}" class="hex-tick">${lvl}</text>`;
  }

  const clampScore = (v) => Math.max(0, Math.min(Number(v) || 0, 5));
  const dataRatioFn = (i) => clampScore(scores[categories[i].key]) / 5;
  const dataPolygon = polygonPoints(dataRatioFn);

  let dots = "";
  categories.forEach((c, i) => {
    const [x, y] = pointAt(i, dataRatioFn(i));
    const s = clampScore(scores[c.key]);
    dots += `<circle cx="${x}" cy="${y}" r="4.5" class="hex-data-dot ${colorClass}"><title>${c.label}: ${s}</title></circle>`;
  });

  const viewSize = size + pad;
  container.innerHTML = `
    <svg viewBox="0 0 ${viewSize} ${viewSize}" class="hex-chart-svg" role="img" aria-label="평가 그래프">
      <g transform="translate(${pad / 2}, ${pad / 2})">
        ${gridPolygons}
        ${axisLines}
        ${levelTicks}
        <polygon points="${dataPolygon}" class="hex-data-polygon ${colorClass}" />
        ${dots}
        ${labels}
      </g>
    </svg>
  `;
}

// 이전 코드와의 호환을 위한 래퍼 (평가1 육각형)
export function renderHexagonChart(container, scores, options = {}) {
  renderRadarChart(container, CATEGORIES, scores, { ...options, colorClass: "navy" });
}

// 평가2 오각형
export function renderPentagonChart(container, scores, options = {}) {
  renderRadarChart(container, CATEGORIES_2, scores, { ...options, colorClass: "accent" });
}
