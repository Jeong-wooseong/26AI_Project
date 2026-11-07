// 파일 열 ↔ 리뷰 필드 연결 (머리글 이름으로 자동 추정, 사용자가 변경 가능)

export const FIELDS = [
  { key: 'rating', label: '별점', required: true },
  { key: 'content', label: '리뷰 내용', required: false },
  { key: 'platform', label: '플랫폼', required: false },
  { key: 'writtenAt', label: '작성일', required: false },
  { key: 'author', label: '작성자', required: false },
];

const HINTS = {
  rating: ['별점', '평점', '점수', 'rating', 'score', 'stars', 'star'],
  content: ['리뷰 내용', '리뷰내용', '리뷰', '내용', '본문', 'review', 'content', 'comment', 'text'],
  platform: ['플랫폼', '출처', '채널', '앱', 'platform', 'source', 'channel'],
  writtenAt: ['작성일', '작성 일자', '날짜', '일자', '등록일', 'date', 'created', 'written'],
  author: ['작성자', '닉네임', '고객', '이름', 'author', 'nickname', 'name', 'user'],
};

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** 머리글로 필드별 열 번호를 추정한다. 못 찾으면 -1. 같은 열을 두 필드에 쓰지 않는다. */
export function guessMapping(header) {
  const used = new Set();
  const mapping = Object.fromEntries(FIELDS.map((f) => [f.key, -1]));
  const cells = header.map(norm);
  // 1차: 머리글이 힌트와 정확히 같은 열, 2차: 힌트를 포함하는 열 (예: "리뷰 작성일"이 "리뷰"로 잘못 잡히지 않게 정확 일치 먼저)
  const looseOrder = ['writtenAt', 'author', 'platform', 'rating', 'content'].map((k) => FIELDS.find((f) => f.key === k));
  for (const exact of [true, false]) {
    for (const field of exact ? FIELDS : looseOrder) {
      if (mapping[field.key] >= 0) continue;
      for (const hint of HINTS[field.key]) {
        const idx = cells.findIndex((c, i) => !used.has(i) && (exact ? c === hint : c.includes(hint)));
        if (idx >= 0) {
          mapping[field.key] = idx;
          used.add(idx);
          break;
        }
      }
    }
  }
  return mapping;
}
