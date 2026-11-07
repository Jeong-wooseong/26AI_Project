package com.replyboss.ai;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * application.yml 의 similarity.* 설정 (중복 답글 방지 3단).
 *
 * @param dimensions             임베딩 길이 (text-embedding-3 계열의 dimensions 파라미터)
 * @param reviewGroupThreshold   입력 시: 이 값 이상이면 비슷한 리뷰로 묶는다
 * @param replyThreshold         출력 시: 최근 답글과 이 값 이상이면 다시 생성한다
 * @param maxRegenerations       출력 시 다시 생성하는 최대 횟수
 * @param compareCount           비교할 최근 최종 답글 수
 * @param reviewGroupDays        입력 시 비교할 기간 (일)
 */
@ConfigurationProperties(prefix = "similarity")
public record SimilarityProperties(
        int dimensions,
        double reviewGroupThreshold,
        double replyThreshold,
        int maxRegenerations,
        int compareCount,
        int reviewGroupDays
) {
}
