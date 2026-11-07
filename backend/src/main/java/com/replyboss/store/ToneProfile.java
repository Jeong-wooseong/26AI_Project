package com.replyboss.store;

import java.util.List;

/**
 * 가게 말투. 예시 답글에서 AI 가 뽑고, 사장님이 화면에서 고친 뒤 저장한다.
 *
 * @param formality     존댓말 수준: 하십시오체 / 해요체 / 반말 섞임
 * @param emojiLevel    이모지 빈도: 없음 / 가끔 / 자주
 * @param emojiExamples 자주 쓰는 이모지 (없으면 빈 목록)
 * @param length        문장 길이: 1~2문장 / 2~3문장 / 3~4문장
 * @param phrases       자주 쓰는 표현 (예시 답글에 실제로 있는 것만)
 * @param closing       마무리 인사 (없으면 빈 문자열)
 */
public record ToneProfile(
        String formality,
        String emojiLevel,
        List<String> emojiExamples,
        String length,
        List<String> phrases,
        String closing
) {
    public static final List<String> FORMALITIES = List.of("하십시오체", "해요체", "반말 섞임");
    public static final List<String> EMOJI_LEVELS = List.of("없음", "가끔", "자주");
    public static final List<String> LENGTHS = List.of("1~2문장", "2~3문장", "3~4문장");

    public ToneProfile {
        emojiExamples = emojiExamples == null ? List.of() : List.copyOf(emojiExamples);
        phrases = phrases == null ? List.of() : List.copyOf(phrases);
        closing = closing == null ? "" : closing.trim();
    }

    public boolean usesEmoji() {
        return !"없음".equals(emojiLevel) && !emojiExamples.isEmpty();
    }
}
