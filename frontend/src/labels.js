export const PLATFORMS = [
  ['BAEMIN', '배달의민족'],
  ['COUPANG_EATS', '쿠팡이츠'],
  ['YOGIYO', '요기요'],
  ['NAVER_MAP', '네이버 지도'],
  ['KAKAO_MAP', '카카오맵'],
  ['ETC', '기타'],
];
export const PLATFORM_LABEL = Object.fromEntries(PLATFORMS);

export const TYPES = [
  ['COMPLAINT', '불만'],
  ['MALICIOUS', '악성'],
  ['PRAISE', '칭찬'],
  ['INQUIRY', '문의'],
  ['RATING_ONLY', '평점만'],
];
export const TYPE_LABEL = Object.fromEntries(TYPES);

export const SENTIMENT_LABEL = { POSITIVE: '긍정', NEUTRAL: '중립', NEGATIVE: '부정' };

export const CATEGORIES = ['카페', '한식', '분식', '중식', '일식', '양식', '치킨', '피자', '디저트', '기타'];

export const FORMALITIES = ['하십시오체', '해요체', '반말 섞임'];
export const EMOJI_LEVELS = ['없음', '가끔', '자주'];
export const LENGTHS = ['1~2문장', '2~3문장', '3~4문장'];

export const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

export const todayISO = () => {
  const d = new Date();
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
