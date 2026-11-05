// 진행률(0~100)에 비례한 색: 낮으면 빨강 → 주황 → 노랑 → 높을수록 초록, 100%는 완료 초록.
// bar 는 막대 색, text 는 흰 바탕에서 읽히도록 어둡게 맞춘 글자 색.
const BAR = [[0, '#d64545'], [35, '#e07b1f'], [70, '#e0a91b'], [99, '#5fae3c'], [100, '#16845d']];
const TEXT = [[0, '#b42f2f'], [35, '#b45309'], [70, '#8a6400'], [99, '#3d7d22'], [100, '#16845d']];

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function at(stops, p) {
  const v = Math.max(0, Math.min(100, p));
  for (let i = 1; i < stops.length; i++) {
    const [p1, c1] = stops[i];
    if (v <= p1) {
      const [p0, c0] = stops[i - 1];
      const t = p1 === p0 ? 1 : (v - p0) / (p1 - p0);
      const [a, b] = [rgb(c0), rgb(c1)];
      return `rgb(${a.map((x, k) => Math.round(x + (b[k] - x) * t)).join(' ')})`;
    }
  }
  return stops[stops.length - 1][1];
}

export function progressColor(pct) {
  if (pct == null) return {};
  return { bar: at(BAR, pct), text: at(TEXT, pct) };
}
