package com.replyboss.review;

public enum ReviewStatus {
    PENDING,     // 저장만 되고 분류 전
    CLASSIFIED,  // 분류 완료
    FAILED       // 분류 실패 (화면에서 다시 시도)
}
