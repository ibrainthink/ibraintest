// ============================================================
// 육각형(6개 영역) 평가 그래프 렌더링
// 배경: 회색 정육각형 그리드(1~5점 레벨)
// 점수: 진파랑 다각형으로 오버레이
// ============================================================

export const CATEGORIES = [
  { key: "su", label: "수" },
  { key: "space", label: "공간·도형" },
  { key: "logic", label: "규칙·추론" },
  { key: "observe", label: "관찰·분류" },
  { key: "problem", label: "문제해결력" },
  { key: "language", label: "언어·표현력" },
];

/**
 * @param {HTMLElement} container  그래프를 그려 넣을 DOM 요소
 * @param {Object} scores  { su, space, logic, observe, problem, language } 각 1~5
 * @param {Object} [options]  { size }
 */
export function renderHexagonChart(container, scores, options = {}) {
  const size = options.size || 300;
  const center = size / 2;
  const maxR = size * 0.34;
  const levels = 5;
  const pad = 46; // 라벨 여백

  function pointAt(index, ratio) {
    const angle = (Math.PI / 180) * (-90 + index * 60);
    const r = maxR * ratio;
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)];
  }

  function polygonPoints(ratioFn) {
    return CATEGORIES.map((c, i) => pointAt(i, ratioFn(i)).join(",")).join(" ");
  }

  let gridPolygons = "";
  for (let lvl = 1; lvl <= levels; lvl++) {
    const ratio = lvl / levels;
    gridPolygons += `<polygon points="${polygonPoints(() => ratio)}" class="hex-grid-ring" />`;
  }

  let axisLines = "";
  let labels = "";
  let levelTicks = "";
  CATEGORIES.forEach((c, i) => {
    const [x, y] = pointAt(i, 1);
    axisLines += `<line x1="${center}" y1="${center}" x2="${x}" y2="${y}" class="hex-axis-line" />`;
    const [lx, ly] = pointAt(i, 1.28);
    labels += `<text x="${lx}" y="${ly}" class="hex-label" text-anchor="middle" dominant-baseline="middle">${c.label}</text>`;
  });
  // 상단 축에만 1~5 레벨 숫자 표시
  for (let lvl = 1; lvl <= levels; lvl++) {
    const [tx, ty] = pointAt(0, lvl / levels);
    levelTicks += `<text x="${tx + 10}" y="${ty}" class="hex-tick">${lvl}</text>`;
  }

  const clampScore = (v) => Math.max(0, Math.min(Number(v) || 0, 5));
  const dataRatioFn = (i) => clampScore(scores[CATEGORIES[i].key]) / 5;
  const dataPolygon = polygonPoints(dataRatioFn);

  let dots = "";
  CATEGORIES.forEach((c, i) => {
    const [x, y] = pointAt(i, dataRatioFn(i));
    const s = clampScore(scores[c.key]);
    dots += `<circle cx="${x}" cy="${y}" r="4.5" class="hex-data-dot"><title>${c.label}: ${s}</title></circle>`;
  });

  const viewSize = size + pad;
  container.innerHTML = `
    <svg viewBox="0 0 ${viewSize} ${viewSize}" class="hex-chart-svg" role="img" aria-label="6개 영역 평가 그래프">
      <g transform="translate(${pad / 2}, ${pad / 2})">
        ${gridPolygons}
        ${axisLines}
        ${levelTicks}
        <polygon points="${dataPolygon}" class="hex-data-polygon" />
        ${dots}
        ${labels}
      </g>
    </svg>
  `;
}
