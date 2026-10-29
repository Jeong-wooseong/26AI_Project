package com.replyboss.review;

import java.util.Arrays;
import java.util.List;

public enum ReviewType {
    PRAISE,      // 칭찬
    COMPLAINT,   // 불만
    MALICIOUS,   // 악성
    INQUIRY,     // 문의
    RATING_ONLY; // 평점만 (LLM 이 아니라 규칙으로 붙인다)

    /** LLM 이 고를 수 있는 유형. RATING_ONLY 는 본문이 없을 때 코드가 붙이므로 제외한다. */
    public static final List<String> LLM_CHOICES = Arrays.stream(values())
            .filter(t -> t != RATING_ONLY)
            .map(Enum::name)
            .toList();
}
