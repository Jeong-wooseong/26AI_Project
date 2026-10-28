// 톤 프로필 미리보기 문장 (AI 호출 없음).
// 백엔드 Greetings 와 같은 규칙으로, 같은 뜻의 인사(감사·좋은 하루 등)가 두 번 나오지 않게 한다.

const SAME_MEANING = [
  ['감사', '고맙', '고마워'],
  ['죄송', '미안', '송구'],
  ['좋은 하루', '행복한 하루', '즐거운 하루', '좋은 밤', '편안한 밤'],
  ['또 뵙', '또 만나', '다음에 또', '또 찾아', '또 들러', '또 와'],
];

export function overlaps(a, b) {
  if (!a || !b) return false;
  if (a.includes(b.trim()) || b.includes(a.trim())) return true;
  return SAME_MEANING.some((group) => group.some((w) => a.includes(w)) && group.some((w) => b.includes(w)));
}

/** 문장 끝에 마침표·물결·느낌표 등이 없으면 마침표를 붙인다 */
function endSentence(s) {
  const t = s.trim();
  return /[.!?~…♡♥)]$|[\u{1F300}-\u{1FAFF}]$/u.test(t) ? t : `${t}.`;
}

const OPENING = {
  하십시오체: '맛있게 드셔주셔서 기쁩니다.',
  해요체: '맛있게 드셨다니 기뻐요!',
  '반말 섞임': '맛있게 먹었다니 기뻐요!',
};
const FALLBACK_MIDDLE = {
  하십시오체: '다음에도 정성껏 준비하겠습니다.',
  해요체: '다음에도 정성껏 준비할게요.',
  '반말 섞임': '다음에도 정성껏 준비할게요.',
};

// 3~4문장일 때 덧붙일 기본 문장 (백엔드 RatingOnlyReplyService 의 높은 별점 기본 문장과 같음)
const EXTRA = {
  하십시오체: '앞으로도 변함없는 맛으로 보답하겠습니다.',
  해요체: '앞으로도 변함없는 맛으로 보답할게요.',
  '반말 섞임': '앞으로도 변함없는 맛으로 보답할게요.',
};

/**
 * 문장 길이 설정을 그대로 반영한 미리보기.
 *  1~2문장: 첫 문장 + 가운데 문장 (마무리 인사 생략)
 *  2~3문장: + 마무리 인사
 *  3~4문장: + 자주 쓰는 표현(또는 기본 문장) 한 문장 + 마무리 인사
 */
export function previewText(tone) {
  const closing = tone.closing?.trim() ?? '';
  const formality = OPENING[tone.formality] ? tone.formality : '해요체';
  const parts = [OPENING[formality]];
  const unused = tone.phrases.filter((p) => !overlaps(p, closing) && !overlaps(p, parts[0]));

  // 가운데 문장: 마무리 인사·첫 문장과 뜻이 겹치지 않는 첫 표현 (없으면 기본 문장)
  parts.push(unused[0] ? endSentence(unused[0]) : FALLBACK_MIDDLE[formality]);
  if (tone.length === '3~4문장') {
    const second = unused.slice(1).find((p) => !overlaps(p, parts[1]));
    const extra = second ? endSentence(second) : EXTRA[formality];
    if (!overlaps(parts.join(' '), extra)) parts.push(extra);
  }
  if (tone.emojiLevel !== '없음' && tone.emojiExamples[0]) {
    parts[parts.length - 1] += ` ${tone.emojiExamples[0]}`;
  }
  if (tone.length !== '1~2문장' && closing && !overlaps(parts.join(' '), closing)) {
    parts.push(closing);
  }
  return parts.join(' ');
}
