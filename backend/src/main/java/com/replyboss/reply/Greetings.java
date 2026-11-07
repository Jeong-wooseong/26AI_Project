package com.replyboss.reply;

import java.util.List;

/**
 * 답글 끝에 마무리 인사를 붙일 때 같은 인사가 두 번 나오지 않게 하는 규칙.
 * 예) "좋은 별점 남겨주셔서 감사드려요." + "이용해주셔서 감사합니다~" → 감사 인사가 겹치므로 붙이지 않는다.
 */
public final class Greetings {

    /** 같은 뜻으로 보는 인사 묶음. 묶음 안의 말이 양쪽에 다 있으면 겹친다고 본다. */
    private static final List<List<String>> SAME_MEANING = List.of(
            List.of("감사", "고맙", "고마워"),
            List.of("죄송", "미안", "송구"),
            List.of("좋은 하루", "행복한 하루", "즐거운 하루", "좋은 밤", "편안한 밤"),
            List.of("또 뵙", "또 만나", "다음에 또", "또 찾아", "또 들러", "또 와")
    );

    private Greetings() {
    }

    /** base 에 이미 closing 과 같은 뜻의 인사가 있으면 true */
    public static boolean overlaps(String base, String closing) {
        if (closing == null || closing.isBlank()) {
            return true;
        }
        if (base.contains(closing.strip())) {
            return true;
        }
        for (List<String> group : SAME_MEANING) {
            boolean inBase = group.stream().anyMatch(base::contains);
            boolean inClosing = group.stream().anyMatch(closing::contains);
            if (inBase && inClosing) {
                return true;
            }
        }
        return false;
    }
}
