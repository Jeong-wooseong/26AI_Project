// 분류 정확도 측정 스크립트
//
// 사용법 (백엔드 실행 중일 때, 프로젝트 루트에서):
//   node eval/classify_eval.mjs                         # eval/sample_reviews_v1.csv 사용
//   node eval/classify_eval.mjs eval/my_reviews.csv     # 다른 셋
//   API=http://localhost:8080 node eval/classify_eval.mjs
//
// - 정확도는 "본문이 있는 리뷰"만으로 계산한다. 평점만 리뷰는 규칙으로 처리되어 항상 맞으므로
//   섞으면 정확도가 부풀려진다. 평점만 리뷰는 규칙 분기가 맞게 동작하는지만 따로 확인한다.
// - 결과는 eval/results/ 에 JSON 으로 남긴다 (프롬프트 버전별 비교용).
// - Node 18 이상 필요 (내장 fetch 사용).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] ?? join(here, 'sample_reviews_v1.csv');
const API = process.env.API ?? 'http://localhost:8080';
const TYPES = ['PRAISE', 'COMPLAINT', 'MALICIOUS', 'INQUIRY'];
const LABEL_KO = { PRAISE: '칭찬', COMPLAINT: '불만', MALICIOUS: '악성', INQUIRY: '문의', RATING_ONLY: '평점만' };

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((v) => v.trim() !== ''));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ''])));
}

const data = parseCsv(readFileSync(file, 'utf8').replace(/^﻿/, ''));
console.log(`${basename(file)}: ${data.length}개 리뷰, API=${API}\n`);

const results = [];
for (const [i, row] of data.entries()) {
  const body = { rating: Number(row.rating), content: row.content };
  let res, out;
  try {
    res = await fetch(`${API}/api/eval/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    out = await res.json();
  } catch (e) {
    console.error(`\n백엔드에 연결할 수 없어요 (${API}). 백엔드를 먼저 실행해주세요.\n${e.message}`);
    process.exit(1);
  }
  if (!res.ok) {
    results.push({ ...row, predicted: null, error: out?.code ?? res.status });
    process.stdout.write('x');
    continue;
  }
  results.push({
    ...row,
    predicted: out.type,
    sentiment: out.sentiment,
    keywords: out.keywords,
    confidence: out.confidence,
    maskedContent: out.maskedContent,
    ruleBased: out.ruleBased,
    latencyMs: out.latencyMs,
  });
  process.stdout.write(out.type === row.label ? '.' : 'F');
  if ((i + 1) % 25 === 0) process.stdout.write('\n');
}
console.log('\n');

// 본문 있는 리뷰만 정확도 계산
const scored = results.filter((r) => r.label !== 'RATING_ONLY');
const answered = scored.filter((r) => r.predicted);
const correct = answered.filter((r) => r.predicted === r.label);
const errors = scored.filter((r) => !r.predicted);
const accuracy = scored.length ? correct.length / scored.length : 0;

// 평점만 규칙 분기 확인
const ratingOnly = results.filter((r) => r.label === 'RATING_ONLY');
const ratingOnlyOk = ratingOnly.filter((r) => r.predicted === 'RATING_ONLY').length;

// 혼동행렬 (행: 정답, 열: 예측)
const matrix = Object.fromEntries(TYPES.map((t) => [t, Object.fromEntries(TYPES.map((p) => [p, 0]))]));
for (const r of answered) {
  if (matrix[r.label] && matrix[r.label][r.predicted] !== undefined) matrix[r.label][r.predicted]++;
}

const pct = (v) => `${(v * 100).toFixed(1)}%`;
console.log(`분류 정확도 (본문 있는 리뷰 ${scored.length}개): ${pct(accuracy)}  [${correct.length}/${scored.length}]  목표 85% ${accuracy >= 0.85 ? '달성' : '미달'}`);
if (errors.length) console.log(`API 오류로 판정 못 함: ${errors.length}개 (오답으로 계산)`);
console.log(`평점만 규칙 분기: ${ratingOnlyOk}/${ratingOnly.length}개 정상`);

console.log('\n유형별 정밀도·재현율');
for (const t of TYPES) {
  const tp = matrix[t][t];
  const predicted = TYPES.reduce((s, l) => s + matrix[l][t], 0);
  const actual = scored.filter((r) => r.label === t).length;
  const precision = predicted ? tp / predicted : 0;
  const recall = actual ? tp / actual : 0;
  console.log(`  ${LABEL_KO[t].padEnd(3, '　')} 정밀도 ${pct(precision).padStart(6)}  재현율 ${pct(recall).padStart(6)}  (정답 ${actual}개)`);
}

console.log('\n혼동행렬 (행: 정답 / 열: 예측)');
console.log('        ' + TYPES.map((t) => LABEL_KO[t].padStart(4, '　')).join(' '));
for (const t of TYPES) {
  console.log(`  ${LABEL_KO[t].padEnd(3, '　')} ` + TYPES.map((p) => String(matrix[t][p]).padStart(5)).join(' '));
}

const wrong = scored.filter((r) => r.predicted !== r.label);
if (wrong.length) {
  console.log('\n틀린 리뷰 (프롬프트 개선에 참고)');
  for (const r of wrong) {
    console.log(`  #${r.id} ★${r.rating} 정답 ${LABEL_KO[r.label]} → 예측 ${LABEL_KO[r.predicted] ?? r.error}: ${r.content}`);
  }
}

const latencies = answered.map((r) => r.latencyMs).filter((v) => v > 0).sort((a, b) => a - b);
if (latencies.length) {
  console.log(`\n응답 시간 중앙값 ${latencies[Math.floor(latencies.length / 2)]}ms, 최대 ${latencies.at(-1)}ms`);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join(here, 'results');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `classify_${basename(file, '.csv')}_${stamp}.json`);
writeFileSync(outFile, JSON.stringify({
  dataset: basename(file),
  measuredAt: new Date().toISOString(),
  accuracy, correct: correct.length, total: scored.length,
  ratingOnly: { ok: ratingOnlyOk, total: ratingOnly.length },
  confusionMatrix: matrix,
  results,
}, null, 2));
console.log(`\n결과 저장: ${outFile}`);
