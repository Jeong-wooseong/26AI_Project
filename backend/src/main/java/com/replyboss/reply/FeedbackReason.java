package com.replyboss.reply;

/** '개선하고 싶어요'를 고를 때의 이유 */
public enum FeedbackReason {
    CONTENT_MISMATCH, // 리뷰 내용과 맞지 않음
    AWKWARD_TONE,     // 말투가 어색함
    WRONG_FACT,       // 사실과 다른 내용
    LENGTH,           // 너무 길거나 짧음
    OTHER             // 기타
}
