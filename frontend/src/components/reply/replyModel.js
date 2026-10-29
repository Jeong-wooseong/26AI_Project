// 답글 상태 규칙 (화면 공통).
//  - 초안(draft): AI가 만든 답글. 몇 개가 있어도 작성 완료가 아니다.
//  - 작성 완료(completed): 사장님이 '작성 완료'로 확정한 최종 답글 하나 (review.finalReplyId).
//  - 복사는 클립보드에 넣기만 하고 상태를 바꾸지 않는다.
// '작성 완료'는 붙여넣을 답글을 확정했다는 뜻이며, 배달앱·지도에 게시되었다는 뜻이 아니다.

export const DRAFT_TYPES = ['PRAISE', 'COMPLAINT', 'INQUIRY'];
export const DRAFT_TONES = ['POLITE', 'FRIENDLY', 'CONCISE'];
export const TONE_LABEL = { POLITE: '정중형', FRIENDLY: '친근형', CONCISE: '간결형', TEMPLATE: '별점 템플릿', GUIDE: '대응 답글' };

/** 악성 리뷰 대응 전략 */
export const STRATEGIES = [
  ['APOLOGY', '사과 후 마무리'],
  ['FACT', '사실 관계 설명'],
  ['HOLD', '응대 보류·신고 검토'],
];
export const STRATEGY_LABEL = Object.fromEntries(STRATEGIES);

/** 이 값 이상이면 이전 답글과 비슷한 것으로 본다 (서버 similarity.reply-threshold 와 같음) */
export const SIMILAR_THRESHOLD = 0.9;

/** 목록 탭 기준 상태 (서로 겹치지 않음): 분류 실패 → 작성 완료 → 작성 대기 */
export function statusOf(review) {
  if (review.status === 'FAILED') return 'fail';
  if (review.finalReplyId != null) return 'done';
  return 'wait';
}

/** 사장님이 보는 답글 문장 (수정본이 있으면 수정본) */
export const textOf = (reply) => reply.editedContent ?? reply.content;

export const finalReplyOf = (review) => review.replies.find((p) => p.id === review.finalReplyId) ?? null;

/** 작성 대기 화면에 보여줄 초안: 최종 답글로 확정된 것과 악성 리뷰 가이드는 빼고, 템플릿 답글은 포함 */
export const draftsOf = (review) => review.replies.filter((p) => p.id !== review.finalReplyId && p.tone !== 'GUIDE');

/** 아직 확정하지 않은 최신 악성 리뷰 대응 가이드 */
export const guideOf = (review) => [...review.replies].reverse()
  .find((p) => p.tone === 'GUIDE' && p.id !== review.finalReplyId) ?? null;

/** 사장님이 채워야 할 자리 [주차 안내 입력] 등 */
export const FILL_IN = /(\[[^\]\n]{1,30}\])/g;
export const hasFillIn = (text) => /\[[^\]\n]{1,30}\]/.test(text);

const pad = (n) => String(n).padStart(2, '0');

/** '2026-10-29T14:32:05' → '10.29 14:32' (올해가 아니면 연도 포함) */
export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const md = `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
  const year = d.getFullYear() === new Date().getFullYear() ? '' : `${d.getFullYear()}.`;
  return `${year}${md} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
