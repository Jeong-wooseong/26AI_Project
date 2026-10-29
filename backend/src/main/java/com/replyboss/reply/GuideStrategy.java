package com.replyboss.reply;

/** 악성 리뷰 대응 전략 */
public enum GuideStrategy {
    APOLOGY, // 사과 후 마무리
    FACT,    // 사실 관계 설명
    HOLD     // 응대 보류·신고 검토
}
