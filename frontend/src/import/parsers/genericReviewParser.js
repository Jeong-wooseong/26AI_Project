// 범용 리뷰 텍스트 파서.
//
// 플랫폼마다 복사되는 텍스트 형식이 다르고, 실제 형식을 확인하지 않은 상태이므로
// "확실히 해석되는 것만 추출하고, 나머지는 사용자 확인으로 넘긴다"를 원칙으로 한다.
//  - 별점·날짜는 그것만 적힌 줄(메타 줄)에서만 읽는다. 문장 속 "별점 5점!" 같은 표현은 본문으로 둔다.
//  - 자동으로 뺀 줄(닉네임 추정, 사장님 답글, 광고 등)은 모두 notes 에 남겨 미리보기에서 보이게 한다.
//  - 별점을 확정할 수 없으면 rating=null 로 두고 사용자가 고르게 한다 (임의 값 생성 금지).
import { cleanText, parseDate, parseRating } from '../normalize.js';

const STAR_RUN = /(?:[★⭐]\uFE0F?)+☆*/gu;
const RATING_TOKENS = [
  /[★⭐]\uFE0F?\s*\d(?:\.\d+)?(?!\d)/gu, // ★ 4.0 (별 하나 + 숫자) — 별 개수보다 먼저 본다
  STAR_RUN, // ★★★★☆
  /(?:별점|평점|평가)\s*[:：]?\s*\d(?:\.\d+)?\s*(?:점|\/\s*5(?:\.0)?)?/g, // 별점 4, 평점: 4.0
  /(?<![\d.])\d(?:\.\d+)?\s*\/\s*5(?:\.0)?(?![\d])/g, // 4/5
  /(?<![\d.])\d\s*점(?!\s*만점)/g, // 4점
];
const DATE_TOKEN = /\d{4}\s*[.\-/년]\s*\d{1,2}\s*[.\-/월]\s*\d{1,2}\s*일?\.?|(?<!\d)\d{2}\.\d{1,2}\.\d{1,2}\.?/g;
const RELATIVE_DATE = /^(오늘|어제|그저께|그제|방금|지난\s*주|\d+\s*(초|분|시간|일|주|개월|달|년)\s*전)$/;
const OWNER_REPLY = /^사장님(\s*(댓글|답글|답변))?(\s*[:：].*)?$|^사장님의\s*(댓글|답글|답변)/;
const AD_LINE = /^(\[광고\]|\(광고\)|광고\s*[:：]|AD\s)/i;
// 앱 화면의 버튼·안내 문구로 보이는 한 줄짜리 텍스트 (그 줄이 이것만 있을 때만 제외)
const UI_NOISE = new Set([
  '더보기', '접기', '신고', '신고하기', '번역', '번역하기', '원문보기', '공유', '공유하기',
  '답글달기', '답글 달기', '댓글달기', '리뷰 더보기', '사진', '동영상', '도움이 돼요', '도움돼요',
]);
const HEADER_MAX = 20; // 닉네임·메뉴명으로 볼 수 있는 짧은 줄 길이

function extractRatings(line) {
  const values = [];
  let rest = line;
  for (const re of RATING_TOKENS) {
    rest = rest.replace(re, (tok) => {
      const v = parseRating(tok.replace(/\uFE0F/g, '').replace(/^(?:별점|평점|평가)\s*[:：]?\s*/, '').replace(/^[★⭐]\s*(?=\d)/u, ''));
      values.push(v);
      return ' ';
    });
  }
  return { values, rest: rest.replace(/\s+/g, ' ').trim() };
}

function extractDate(line) {
  let date = null;
  const rest = line.replace(DATE_TOKEN, (tok) => {
    date = date ?? parseDate(tok);
    return ' ';
  });
  return { date, rest: rest.replace(/\s+/g, ' ').trim() };
}

/** 리뷰 하나(텍스트 묶음)를 해석한다 */
function parseBlock(blockText) {
  const lines = blockText.split('\n').filter(Boolean);
  const notes = [];
  const ratings = [];
  const removed = [];
  let writtenAt = null;
  let ratingLineIndex = -1;
  const kept = []; // { text, index }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (OWNER_REPLY.test(line)) {
      notes.push({ level: 'warn', text: `사장님 답글로 보이는 ${lines.length - i}줄 제외` });
      break;
    }
    if (AD_LINE.test(line)) {
      removed.push(line);
      continue;
    }
    if (UI_NOISE.has(line)) {
      removed.push(line);
      continue;
    }
    if (RELATIVE_DATE.test(line)) {
      notes.push({ level: 'warn', text: `상대 날짜("${line}")는 작성일로 등록하지 않음` });
      continue;
    }

    // 메타 줄: 별점·날짜를 빼고 남는 글자가 짧은 줄
    const r = extractRatings(line);
    const d = extractDate(r.rest);
    const hasRating = r.values.length > 0;
    const hasDate = d.date != null;
    if ((hasRating || hasDate) && d.rest.length <= HEADER_MAX) {
      if (hasRating) {
        ratings.push(...r.values);
        if (ratingLineIndex < 0) ratingLineIndex = i;
      }
      if (hasDate) writtenAt = writtenAt ?? d.date;
      // 같은 줄에 남은 글자(닉네임일 수도, 짧은 본문일 수도 있음)는 지우지 않고 본문으로 둔다 → 미리보기에서 확인
      if (d.rest) kept.push({ text: d.rest, index: i });
      continue;
    }
    if (hasRating) {
      notes.push({ level: 'warn', text: '본문 속 별점 표현은 자동 적용하지 않음' });
    }
    kept.push({ text: line, index: i });
  }

  // 별점 줄 앞의 짧은 줄은 닉네임·메뉴명으로 보고 제외 (뒤에 본문이 있을 때만)
  if (ratingLineIndex > 0) {
    const before = kept.filter((k) => k.index < ratingLineIndex);
    const after = kept.filter((k) => k.index >= ratingLineIndex);
    if (after.some((k) => k.index > ratingLineIndex) && before.length > 0 && before.every((k) => k.text.length <= HEADER_MAX)) {
      notes.push({ level: 'warn', text: `닉네임·메뉴로 추정해 제외: ${before.map((k) => `"${k.text}"`).join(', ')}` });
      kept.splice(0, kept.length, ...after);
    }
  }

  // 복사 과정에서 같은 줄이 연달아 반복된 경우 한 번만 남긴다
  const content = [];
  for (const k of kept) {
    if (content[content.length - 1] === k.text) {
      notes.push({ level: 'warn', text: '반복된 줄 1개 정리' });
      continue;
    }
    content.push(k.text);
  }

  if (removed.length) {
    const shown = removed.slice(0, 3).map((t) => `"${t.length > 12 ? `${t.slice(0, 12)}…` : t}"`).join(', ');
    notes.push({ level: 'warn', text: `제외한 줄: ${shown}${removed.length > 3 ? ` 외 ${removed.length - 3}개` : ''}` });
  }

  const distinct = [...new Set(ratings)];
  let rating = null;
  if (distinct.length === 0) {
    notes.push({ level: 'error', text: '별점을 찾지 못함' });
  } else if (distinct.length > 1 || distinct[0] == null) {
    const shown = distinct.filter((v) => v != null);
    notes.push({ level: 'error', text: shown.length > 1 ? `별점 후보가 여러 개 (${shown.join(', ')})` : '별점을 1~5 정수로 확정할 수 없음' });
  } else {
    rating = distinct[0];
  }

  return { rating, content: content.join('\n'), writtenAt, notes, raw: blockText };
}

/** 리뷰 경계 나누기: 빈 줄이 있으면 빈 줄 기준, 없으면 별점 메타 줄 기준, 그것도 없으면 한 줄에 하나 */
function splitBlocks(text) {
  if (/\n\s*\n/.test(text)) {
    return { mode: 'blank-line', blocks: text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean) };
  }
  const lines = text.split('\n').filter(Boolean);
  // 별점(과 날짜)만 있는 줄 = 여러 줄짜리 리뷰의 머리줄로 본다
  const isRatingMeta = (l) => {
    const r = extractRatings(l);
    return r.values.length > 0 && extractDate(r.rest).rest.length === 0;
  };
  if (lines.filter(isRatingMeta).length < 2) {
    return { mode: 'line', blocks: lines };
  }
  const blocks = [];
  let current = [];
  for (const l of lines) {
    if (isRatingMeta(l) && current.some(isRatingMeta)) {
      // 다음 리뷰의 별점 줄 바로 앞 짧은 줄은 다음 리뷰의 닉네임일 가능성이 높아 함께 넘긴다 (본문이 남을 때만)
      const metaAt = current.findIndex(isRatingMeta);
      const carry = current.length - 1 > metaAt + 1 && current[current.length - 1].length <= HEADER_MAX
        ? [current.pop()] : [];
      blocks.push(current.join('\n'));
      current = carry;
    }
    current.push(l);
  }
  if (current.length) blocks.push(current.join('\n'));
  return { mode: 'rating-line', blocks };
}

const SEPARATORS = /^[|\-–:：,/\s]+|[|\-–:：,/\s]+$/g;
const ANCHORED = RATING_TOKENS.flatMap((re) => [
  new RegExp(`^\\s*(?:${re.source})`, 'u'),
  new RegExp(`(?:${re.source})\\s*$`, 'u'),
]);

/**
 * 한 줄에 별점과 본문이 같이 있는 형태: "★★★★★ 맛있어요", "4점 | 배달이 늦어요", "맛있어요 ★★★★★"
 * 별점 표기는 줄의 맨 앞이나 맨 뒤에 있을 때만 별점으로 본다. 문장 중간의 "별점 5점 드릴게요"는 본문이다.
 */
function parseInlineLine(line) {
  const notes = [];
  const all = extractRatings(line);
  for (const re of ANCHORED) {
    const m = line.match(re);
    if (!m) continue;
    const rest = (line.slice(0, m.index) + line.slice(m.index + m[0].length)).trim();
    if (extractRatings(rest).values.length > 0) {
      // 맛 ★5 양 ★4 처럼 별점 표기가 여러 개 → 확정하지 않는다
      return { rating: null, content: line, writtenAt: null, notes: [{ level: 'error', text: '별점 표기가 여러 개라 확정할 수 없음' }], raw: line };
    }
    const d = extractDate(rest);
    const rating = parseRating(m[0].replace(/\uFE0F/g, '').replace(/^\s*(?:별점|평점|평가)\s*[:：]?\s*/, '').replace(/^\s*[★⭐]\s*(?=\d)/u, '').trim());
    if (rating == null) notes.push({ level: 'error', text: '별점을 1~5 정수로 확정할 수 없음' });
    return { rating, content: d.rest.replace(SEPARATORS, ''), writtenAt: d.date, notes, raw: line };
  }
  if (all.values.length > 0) notes.push({ level: 'warn', text: '본문 속 별점 표현은 자동 적용하지 않음' });
  notes.push({ level: 'error', text: '별점을 찾지 못함' });
  return { rating: null, content: line, writtenAt: null, notes, raw: line };
}

export const genericReviewParser = {
  id: 'generic',
  label: '범용 파서',
  platform: null,
  /** 범용 파서는 항상 마지막 대안이다 */
  detect: () => true,
  parse(input) {
    const text = cleanText(input);
    if (!text) return { items: [], mode: 'empty' };
    const { mode, blocks } = splitBlocks(text);
    // 한 줄짜리 리뷰는 별점과 본문이 같은 줄에 있으므로, 남는 글자를 닉네임으로 보지 않고 본문으로 둔다
    const items = blocks
      .map((b) => (!b.includes('\n') ? parseInlineLine(b) : parseBlock(b)))
      .filter((it) => it.content || it.rating != null);
    if (mode === 'rating-line') {
      for (const it of items) it.notes.push({ level: 'warn', text: '빈 줄 구분이 없어 리뷰 경계를 별점 줄 기준으로 추정함' });
    }
    return { items, mode };
  },
};
