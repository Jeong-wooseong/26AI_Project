// 리뷰 텍스트 파서 레지스트리.
//
// 플랫폼 전용 파서(BaeminReviewParser, NaverReviewParser 등)는 실제 복사 텍스트 샘플로 형식을 확인한 뒤에만 추가한다.
// 추가 방법: { id, label, platform, detect(text) → boolean, parse(text) → { items, mode } } 객체를 만들어
// PLATFORM_PARSERS 에 넣는다. detect 는 그 플랫폼 형식이 확실할 때만 true 를 돌려야 한다.
// items 의 각 항목: { rating: 1~5|null, content, writtenAt: 'YYYY-MM-DD'|null, notes: [{level, text}], raw }
import { genericReviewParser } from './genericReviewParser.js';

/** 형식이 확인된 플랫폼 전용 파서 (현재 없음 — 실제 샘플 확보 후 추가) */
export const PLATFORM_PARSERS = [];

/** 텍스트에 맞는 파서를 고른다. 전용 파서가 확신하지 못하면 범용 파서를 쓴다. */
export function pickParser(text) {
  return PLATFORM_PARSERS.find((p) => p.detect(text)) ?? genericReviewParser;
}

export function parseReviewText(text) {
  const parser = pickParser(text);
  return { parser, ...parser.parse(text) };
}
