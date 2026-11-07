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

/** "~다", "~요" 등으로 끝나는 완결된 문장인지. "이용해주셔서" 같은 표현 조각은 미리보기 문장으로 쓰지 않는다 */
const isSentence = (s) => /[다요죠네까][\s.!?~…♡♥)]*$/.test(s.trim());

/*
 * 미리보기 문장 틀 (리뷰 "정말 맛있게 잘 먹었어요! 포장도 꼼꼼해서 좋았습니다." 를 가정).
 * 답글 프롬프트 v12 와 같은 구성: 리뷰 경험에 반응 → 사장님 마음과 이유 → 구체적인 다짐 → 마무리 인사.
 * 문장마다 40자 안팎을 담아, 길이 설정의 글자 수 목표(백엔드 ReplyGenerationService.charRange)에 들어오게 한다.
 * thanks·promise 는 문장 끝(end)을 사장님의 짧은 표현으로 바꿔 끼울 수 있게 앞부분(stem)과 나눠 둔다.
 * promise.alt 는 사장님 표현에 '보답'이 이미 있을 때 같은 말이 두 번 나오지 않게 쓰는 끝맺음.
 */
const TEMPLATES = {
  하십시오체: {
    reaction: '정말 맛있게 잘 드셨다는 말씀을 들으니 오늘도 하나하나 정성껏 준비한 보람이 느껴져 참 기쁩니다.',
    thanks: { stem: '포장까지 꼼꼼하다고 알아봐 주셔서 저희가 특히 신경 쓴 부분이 고객님께 잘 전해진 것 같아 ', end: '더욱 감사한 마음입니다.', plain: '참 다행입니다.' },
    promise: { stem: '다음 주문 때도 오늘처럼 맛있는 음식과 꼼꼼한 포장 그대로 받아 보실 수 있도록 ', end: '정성껏 보답하겠습니다.', alt: '변함없이 준비하겠습니다.' },
  },
  해요체: {
    reaction: '정말 맛있게 잘 드셨다는 말씀을 들으니 오늘도 하나하나 정성껏 준비한 보람이 느껴져 참 기뻐요!',
    thanks: { stem: '포장까지 꼼꼼하다고 알아봐 주셔서 저희가 특히 신경 쓴 부분이 고객님께 잘 전해진 것 같아 ', end: '더 감사한 마음이에요.', plain: '참 다행이에요.' },
    promise: { stem: '다음 주문 때도 오늘처럼 맛있는 음식과 꼼꼼한 포장 그대로 받아 보실 수 있도록 ', end: '정성껏 보답할게요.', alt: '변함없이 준비할게요.' },
  },
  '반말 섞임': {
    reaction: '맛있게 잘 먹었다는 말을 들으니 오늘도 하나하나 정성껏 준비한 보람이 느껴져서 정말 기뻐요!',
    thanks: { stem: '포장까지 꼼꼼하다고 알아봐 줘서 우리가 특히 신경 쓴 부분이 손님한테 잘 전해진 것 같아 ', end: '더 고마워요.', plain: '참 다행이에요.' },
    promise: { stem: '다음 주문 때도 오늘처럼 맛있는 음식과 꼼꼼한 포장 그대로 받아 볼 수 있게 ', end: '또 정성껏 준비할게요.', alt: '변함없이 준비할게요.' },
  },
};

/** 길이 설정의 목표 문장 수 (모델에 주는 목표처럼 위쪽 끝)와 최소 글자 수(공백 제외, 백엔드 charRange 와 같음) */
const TARGET = { '1~2문장': 2, '2~3문장': 3, '3~4문장': 4 };
const MIN_LETTERS = { '1~2문장': 30, '2~3문장': 75, '3~4문장': 120 };
/** 공백 제외 이 글자 수보다 짧은 표현은 한 문장으로 두지 않고 문장 끝에 녹인다 (백엔드 THIN_SENTENCE 와 같음) */
const THIN = 9;
const letters = (s) => s.replace(/\s+/g, '').length;
const isThanks = (p) => SAME_MEANING[0].some((w) => p.includes(w));
const isPromise = (p) => /(게요|겠습니다|드릴게|할게)[\s.!?~…]*$/.test(p.trim());

/**
 * 길이 설정·높임말·자주 쓰는 표현·이모지·마무리 인사를 반영한 미리보기.
 *  1~2문장: 반응 + 다짐 (마무리 인사 생략)
 *  2~3문장: 반응 + 마음 + 다짐 중 목표만큼 + 마무리 인사
 *  3~4문장: 반응 + 마음 + (긴 자주 쓰는 표현) + 다짐 + 마무리 인사
 * 자주 쓰는 표현이 짧으면 감사 표현은 '마음' 문장 끝에, 다짐 표현은 '다짐' 문장 끝에 넣는다.
 * 목표 문장 수로 글자 수가 모자라면, 백엔드가 허용하는 만큼(목표 + 1문장) 한 문장을 더 쓴다.
 */
export function previewText(tone) {
  const closing = tone.closing?.trim() ?? '';
  const t = TEMPLATES[tone.formality] ?? TEMPLATES['해요체'];
  const phrases = tone.phrases.filter((p) => isSentence(p) && !overlaps(p, closing));
  const shortThanks = phrases.find((p) => letters(p) < THIN && isThanks(p));
  const shortPromise = phrases.find((p) => letters(p) < THIN && !isThanks(p) && isPromise(p));
  const long = phrases.find((p) => letters(p) >= THIN && !overlaps(p, t.reaction));

  // 마무리 인사가 감사 인사면 '마음' 문장에서 감사를 빼 같은 뜻이 두 번 나오지 않게 한다
  const thanksEnd = shortThanks ? endSentence(shortThanks) : (closing && isThanks(closing) ? t.thanks.plain : t.thanks.end);
  const thanksText = t.thanks.stem + thanksEnd;
  const owner = [shortPromise, long].filter(Boolean).join(' ');
  const promiseEnd = shortPromise ? endSentence(shortPromise) : (owner.includes('보답') ? t.promise.alt : t.promise.end);
  const all = [
    { text: t.reaction, key: 'reaction' },
    { text: thanksText, key: 'thanks', woven: !!shortThanks },
    long && !overlaps(long, thanksText) ? { text: endSentence(long), key: 'long', woven: true } : null,
    { text: t.promise.stem + promiseEnd, key: 'promise', woven: !!shortPromise },
  ].filter(Boolean);

  const withClosing = tone.length !== '1~2문장' && !!closing;
  const target = (TARGET[tone.length] ?? 3) - (withClosing ? 1 : 0);
  const build = (count) => {
    const body = [...all];
    // 문장이 많으면 표현을 넣지 않은 '마음' → 긴 표현 → 표현을 넣지 않은 '다짐' → '마음' 순서로 뺀다
    for (const pick of [
      (b) => b.key === 'thanks' && !b.woven,
      (b) => b.key === 'long',
      (b) => b.key === 'promise' && !b.woven,
      (b) => b.key === 'thanks',
    ]) {
      while (body.length > count) {
        const i = body.findIndex(pick);
        if (i <= 0) break;
        body.splice(i, 1);
      }
    }
    const parts = body.map((b) => b.text);
    if (tone.emojiLevel !== '없음' && tone.emojiExamples[0]) {
      parts[parts.length - 1] += ` ${tone.emojiExamples[0]}`;
    }
    if (withClosing && !overlaps(parts.join(' '), closing)) {
      parts.push(closing);
    }
    return parts.join(' ');
  };
  const text = build(target);
  return letters(text) < (MIN_LETTERS[tone.length] ?? 75) ? build(target + 1) : text;
}

/**
 * 미리보기 문장에서 자주 쓰는 표현·마무리 인사가 들어간 자리를 표시하려고 나눈다.
 *  [{ text, mark }] 순서대로 이어 붙이면 원래 문장이 된다. 긴 표현부터 찾는다.
 */
export function markParts(text, marks) {
  const list = [...new Set(marks.map((m) => m?.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  const out = [];
  let rest = text;
  while (rest) {
    let hit = null;
    for (const m of list) {
      const i = rest.indexOf(m);
      if (i >= 0 && (!hit || i < hit.i)) hit = { i, m };
    }
    if (!hit) { out.push({ text: rest, mark: false }); break; }
    if (hit.i > 0) out.push({ text: rest.slice(0, hit.i), mark: false });
    out.push({ text: hit.m, mark: true });
    rest = rest.slice(hit.i + hit.m.length);
  }
  return out;
}
