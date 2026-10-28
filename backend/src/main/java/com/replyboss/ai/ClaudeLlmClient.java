package com.replyboss.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.replyboss.common.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Claude Messages API 클라이언트.
 * 구조화 출력은 output_config.format(type=json_schema) 로 요청하고, 응답의 text 블록을 JSON 으로 읽는다.
 */
@Component
public class ClaudeLlmClient implements LlmClient {

    private static final Logger log = LoggerFactory.getLogger(ClaudeLlmClient.class);

    private final ClaudeProperties props;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    public ClaudeLlmClient(ClaudeProperties props, ObjectMapper objectMapper) {
        this.props = props;
        this.objectMapper = objectMapper;

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(10));
        factory.setReadTimeout(Duration.ofSeconds(Math.max(1, props.timeoutSeconds())));

        this.restClient = RestClient.builder()
                .baseUrl(props.baseUrl())
                .requestFactory(factory)
                .defaultHeader("x-api-key", props.apiKey() == null ? "" : props.apiKey())
                .defaultHeader("anthropic-version", props.apiVersion())
                .build();
    }

    @Override
    public JsonNode generateJson(LlmRequest request) {
        if (!props.hasApiKey()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "LLM_NOT_CONFIGURED",
                    "Claude API 키가 설정되지 않았어요. backend/.env 의 ANTHROPIC_API_KEY 를 확인해주세요.");
        }

        Map<String, Object> body = buildBody(request);
        int attempts = 1 + Math.max(0, props.maxRetries());
        RuntimeException last = null;

        for (int i = 1; i <= attempts; i++) {
            try {
                JsonNode response = restClient.post()
                        .uri("/v1/messages")
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(body)
                        .retrieve()
                        .body(JsonNode.class);
                return extractJson(response);
            } catch (RestClientException | LlmException e) {
                last = e;
                log.warn("Claude 호출 실패 ({}/{}): {}", i, attempts, e.getMessage());
            }
        }
        throw new LlmException("Claude 호출이 " + attempts + "회 모두 실패했습니다", last);
    }

    Map<String, Object> buildBody(LlmRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", request.model());
        body.put("max_tokens", request.maxTokens());
        body.put("temperature", request.temperature());
        body.put("system", request.system());
        body.put("messages", List.of(Map.of("role", "user", "content", request.user())));
        body.put("output_config", Map.of(
                "format", Map.of("type", "json_schema", "schema", request.schema())
        ));
        return body;
    }

    JsonNode extractJson(JsonNode response) {
        if (response == null) {
            throw new LlmException("빈 응답");
        }
        String stopReason = response.path("stop_reason").asText("");
        if ("refusal".equals(stopReason)) {
            throw new LlmException("모델이 응답을 거절했습니다");
        }
        if ("max_tokens".equals(stopReason)) {
            throw new LlmException("응답이 max_tokens 에서 잘렸습니다");
        }
        for (JsonNode block : response.path("content")) {
            if ("text".equals(block.path("type").asText())) {
                try {
                    return objectMapper.readTree(block.path("text").asText());
                } catch (JsonProcessingException e) {
                    throw new LlmException("응답 JSON 을 읽을 수 없습니다", e);
                }
            }
        }
        throw new LlmException("응답에 text 블록이 없습니다");
    }
}
