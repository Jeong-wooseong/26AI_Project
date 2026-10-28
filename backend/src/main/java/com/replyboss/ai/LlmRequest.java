package com.replyboss.ai;

import java.util.Map;

/**
 * 구조화 출력(JSON Schema) 요청 한 건.
 *
 * @param model       사용할 모델 ID
 * @param system      시스템 프롬프트 (역할·규칙)
 * @param user        사용자 메시지 (리뷰 등 이번 입력)
 * @param schema      응답 JSON Schema. object 에는 additionalProperties=false 가 필요하다
 * @param maxTokens   최대 출력 토큰
 * @param temperature 0~1, 분류는 낮게, 문장 생성은 높게
 */
public record LlmRequest(
        String model,
        String system,
        String user,
        Map<String, Object> schema,
        int maxTokens,
        double temperature
) {
}
