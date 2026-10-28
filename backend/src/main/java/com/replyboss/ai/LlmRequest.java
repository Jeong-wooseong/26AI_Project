package com.replyboss.ai;

import java.util.Map;

/**
 * 구조화 출력(JSON Schema) 요청 한 건.
 *
 * @param model      사용할 모델 ID
 * @param system     시스템 프롬프트 (역할·규칙)
 * @param user       사용자 메시지 (리뷰 등 이번 입력)
 * @param schemaName 스키마 이름 (영문·숫자·_ 만, 예: review_classification)
 * @param schema     응답 JSON Schema. strict 모드라 object 는 모든 속성 required, additionalProperties=false
 * @param maxTokens  최대 출력 토큰. 추론 모델은 추론 토큰도 여기에 포함되므로 넉넉히 준다
 */
public record LlmRequest(
        String model,
        String system,
        String user,
        String schemaName,
        Map<String, Object> schema,
        int maxTokens
) {
}
