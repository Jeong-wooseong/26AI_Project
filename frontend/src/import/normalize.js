// 일괄 가져오기에서 쓰는 값 정리 함수들. 확실하지 않은 값은 만들어 내지 않고 null 을 돌려준다.
import { PLATFORMS } from '../labels.js';

export const MAX_CONTENT_LENGTH = 2000; // 서버 검증과 같은 값

/** 줄 끝 공백·연속 빈 줄·보이지 않는 문자를 정리한다 (내용은 바꾸지 않음) */
export function cleanText(text) {
  return String(text ?? '')
    .replace(/[​-‍﻿]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 중복 비교용 키: 공백 차이를 무시한다 */
export const contentKey = (text) => cleanText(text).replace(/\s+/g, ' ');

/**
 * 별점 값 하나를 1~5 정수로 바꾼다. 해석할 수 없거나 범위를 벗어나면 null.
 * 허용: 5, "5", "5점", "5.0", "★★★★☆", "4/5"
 * 소수(4.5 등)는 서비스가 정수 별점만 받으므로 null (사용자가 직접 선택).
 */
export function parseRating(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
  const s = String(value).trim();
  if (!s) return null;
  const stars = s.match(/^([★⭐]+)([☆]*)$/u);
  if (stars) {
    const filled = [...stars[1]].length;
    return filled >= 1 && filled <= 5 && filled + [...stars[2]].length <= 5 ? filled : null;
  }
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(?:점|\/\s*5(?:\.0)?)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

const PLATFORM_ALIASES = [
  ['BAEMIN', ['배달의민족', '배민', 'baemin']],
  ['COUPANG_EATS', ['쿠팡이츠', '쿠팡', 'coupangeats', 'coupang_eats', 'coupang eats']],
  ['YOGIYO', ['요기요', 'yogiyo']],
  ['NAVER_MAP', ['네이버 지도', '네이버지도', '네이버 플레이스', '네이버플레이스', '네이버', 'naver', 'naver_map']],
  ['KAKAO_MAP', ['카카오맵', '카카오 맵', '카카오', 'kakao', 'kakao_map']],
  ['ETC', ['기타', 'etc']],
];

/** 플랫폼 이름 → 서비스 플랫폼 값. 모르는 이름이면 null */
export function parsePlatform(value) {
  const s = String(value ?? '').trim().toLowerCase();
  if (!s) return null;
  if (PLATFORMS.some(([v]) => v.toLowerCase() === s)) return s.toUpperCase();
  const hit = PLATFORM_ALIASES.find(([, names]) => names.includes(s));
  return hit ? hit[0] : null;
}

const pad = (n) => String(n).padStart(2, '0');

function validDate(y, m, d) {
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (dt > today) return null; // 미래 날짜는 작성일일 수 없음
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * 작성일 → 'YYYY-MM-DD'. 연도가 있는 절대 날짜만 받는다.
 * '어제', '3일 전', '10월 28일'처럼 기준 연도·날짜를 추측해야 하는 값은 null.
 * excelSerial: XLSX 의 날짜 셀(숫자)을 받을 때 true
 */
export function parseDate(value, { excelSerial = false } = {}) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    if (!excelSerial || value < 20000 || value > 80000) return null; // 1954~2119년 범위의 엑셀 일련번호만
    const ms = Math.round((value - 25569) * 86400 * 1000); // 1900 날짜 체계 → Unix
    const d = new Date(ms);
    return validDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?\.?(?:\s.*)?$/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{2})\.(\d{1,2})\.(\d{1,2})\.?$/); // 26.10.28 형식
  if (m) return validDate(2000 + +m[1], +m[2], +m[3]);
  if (/^\d+(\.\d+)?$/.test(s) && excelSerial) return parseDate(Number(s), { excelSerial });
  return null;
}
