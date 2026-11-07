// 일괄 등록 미리보기의 행 모델과 검증.
import { MAX_CONTENT_LENGTH, cleanText, contentKey, parseDate, parsePlatform, parseRating } from './normalize.js';

export const MAX_BULK_ROWS = 300; // 미리보기 한 번에 다루는 최대 행 수
export const CHUNK_SIZE = 30; // 서버의 한 요청 최대 개수와 같음

let seq = 0;

function makeRow(fields) {
  seq += 1;
  return {
    id: `r${seq}`,
    platform: null,
    platformFrom: 'default', // 'default'(화면에서 고른 출처) | 'data'(파일 값) | 'user'(행에서 직접 고름)
    rating: null,
    content: '',
    writtenAt: null,
    author: null,
    warns: [], // 자동 처리 내역 (확인 권장)
    ratingIssue: null, // 별점을 확정하지 못한 이유
    platformIssue: null,
    excluded: false,
    allowDup: false, // 중복이어도 등록
    serverDup: false, // 이미 등록된 리뷰와 같음 (서버 확인 결과)
    state: 'pending', // 'pending' | 'done'
    raw: null,
    source: '',
    ...fields,
  };
}

/** 붙여넣기 파서 결과 → 행 */
export function rowsFromParsed(items, defaultPlatform) {
  return items.map((it, i) => {
    const error = it.notes.find((n) => n.level === 'error');
    return makeRow({
      platform: defaultPlatform,
      rating: it.rating,
      content: it.content,
      writtenAt: it.writtenAt,
      warns: it.notes.filter((n) => n.level === 'warn').map((n) => n.text),
      ratingIssue: it.rating == null ? error?.text ?? '별점을 찾지 못함' : null,
      raw: it.raw,
      source: `${i + 1}번째 묶음`,
    });
  });
}

const isBlank = (v) => v == null || String(v).trim() === '';

/** 파일 표 → 행. mapping: { rating, content, platform, writtenAt, author } 열 번호(-1 은 없음) */
export function rowsFromTable(dataRows, mapping, { defaultPlatform, firstRowNumber }) {
  const cell = (row, key) => (mapping[key] >= 0 ? row[mapping[key]] : undefined);
  const out = [];
  dataRows.forEach((row, i) => {
    const ratingCell = cell(row, 'rating');
    const contentCell = cell(row, 'content');
    const platformCell = cell(row, 'platform');
    const dateCell = cell(row, 'writtenAt');
    const authorCell = cell(row, 'author');
    if ([ratingCell, contentCell, platformCell, dateCell].every(isBlank)) return; // 빈 행

    const warns = [];
    const rating = parseRating(typeof ratingCell === 'string' ? ratingCell.trim() : ratingCell);
    let ratingIssue = null;
    if (rating == null) ratingIssue = isBlank(ratingCell) ? '별점 값 없음 (필수)' : `별점 값 "${String(ratingCell).trim()}" 해석 불가 (1~5 정수)`;

    let platform = defaultPlatform;
    let platformFrom = 'default';
    let platformIssue = null;
    if (!isBlank(platformCell)) {
      platform = parsePlatform(platformCell);
      platformFrom = 'data';
      if (!platform) platformIssue = `플랫폼 "${String(platformCell).trim()}" 인식 불가`;
    }

    let writtenAt = null;
    if (!isBlank(dateCell)) {
      writtenAt = parseDate(dateCell, { excelSerial: typeof dateCell === 'number' });
      if (!writtenAt) warns.push(`작성일 "${String(dateCell).trim()}" 인식 불가 — 작성일 없이 등록`);
    }

    out.push(makeRow({
      platform,
      platformFrom,
      platformIssue,
      rating,
      ratingIssue,
      content: isBlank(contentCell) ? '' : cleanText(contentCell),
      writtenAt,
      author: isBlank(authorCell) ? null : String(authorCell).trim(),
      warns,
      raw: row.map((c) => String(c ?? '')).join(' | '),
      source: `${firstRowNumber + i}행`,
    }));
  });
  return out;
}

/** 지금 상태 기준의 오류 (등록을 막음) */
export function rowErrors(row) {
  const errors = [];
  if (row.rating == null) errors.push(row.ratingIssue ? `${row.ratingIssue} — 별점 선택 필요` : '별점 선택 필요');
  if (!row.platform) errors.push(row.platformIssue ? `${row.platformIssue} — 출처 선택 필요` : '출처 선택 필요');
  if (row.content.length > MAX_CONTENT_LENGTH) errors.push(`리뷰 내용 ${MAX_CONTENT_LENGTH}자 초과`);
  return errors;
}

/** 같은 목록 안의 중복: 출처와 본문(공백 무시)이 같으면 두 번째부터 중복. 별점만 있는 행은 구별할 수 없어 제외. */
export function batchDuplicates(rows) {
  const first = new Map();
  const dup = new Map(); // id → 먼저 나온 행 번호(1부터)
  rows.forEach((row, i) => {
    if (row.excluded || !row.content.trim()) return;
    const key = `${row.platform}|${contentKey(row.content)}`;
    if (first.has(key)) dup.set(row.id, first.get(key) + 1);
    else first.set(key, i);
  });
  return dup;
}

/** 행 상태: done | excluded | error | duplicate | warn | ready */
export function rowStatus(row, dupOf) {
  if (row.state === 'done') return { key: 'done', label: '등록 완료' };
  if (row.excluded) return { key: 'excluded', label: '제외' };
  const errors = rowErrors(row);
  if (errors.length) return { key: 'error', label: '확인 필요', detail: errors };
  if (!row.allowDup && row.serverDup) return { key: 'duplicate', label: '이미 등록됨', detail: ['같은 출처에 같은 본문의 리뷰가 이미 있음'] };
  if (!row.allowDup && dupOf) return { key: 'duplicate', label: `중복 (${dupOf}번)`, detail: [`${dupOf}번 행과 출처·본문이 같음`] };
  if (row.warns.length) return { key: 'warn', label: '확인 권장', detail: row.warns };
  return { key: 'ready', label: '등록 가능' };
}

export const isRegistrable = (row, dupOf) => ['ready', 'warn'].includes(rowStatus(row, dupOf).key);
