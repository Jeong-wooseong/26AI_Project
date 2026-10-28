package com.replyboss.ai;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * application.yml 의 claude.* 설정. API 키는 환경변수(ANTHROPIC_API_KEY)나 backend/.env 로만 넣는다.
 */
@ConfigurationProperties(prefix = "claude")
public record ClaudeProperties(
        String apiKey,
        String baseUrl,
        String apiVersion,
        String classifyModel,
        String generateModel,
        int timeoutSeconds,
        int maxRetries
) {
    public boolean hasApiKey() {
        return apiKey != null && !apiKey.isBlank();
    }
}
