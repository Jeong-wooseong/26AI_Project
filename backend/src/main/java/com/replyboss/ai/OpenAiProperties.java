package com.replyboss.ai;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * application.yml 의 openai.* 설정. API 키는 환경변수(OPENAI_API_KEY)나 backend/.env 로만 넣는다.
 *
 * @param reasoningEffort 추론 모델의 reasoning_effort (예: low). 비워두면 보내지 않는다
 */
@ConfigurationProperties(prefix = "openai")
public record OpenAiProperties(
        String apiKey,
        String baseUrl,
        String classifyModel,
        String generateModel,
        String embeddingModel,
        String reasoningEffort,
        int timeoutSeconds,
        int maxRetries
) {
    public boolean hasApiKey() {
        return apiKey != null && !apiKey.isBlank();
    }
}
