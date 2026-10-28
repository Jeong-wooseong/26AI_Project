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
 * OpenAI Chat Completions 클라이언트.
 * 구조화 출력은 response_format(type=json_schema, strict=true) 로 요청하고,
 * choices[0].message.content 의 JSON 을 읽는다.
 */
@Component
public class OpenAiLlmClient implements LlmClient {

    private static final Logger log = LoggerFactory.getLogger(OpenAiLlmClient.class);

    private final OpenAiProperties props;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    public OpenAiLlmClient(OpenAiProperties props, ObjectMapper objectMapper) {
        this.props = props;
        this.objectMapper = objectMapper;

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(10));
        factory.setReadTimeout(Duration.ofSeconds(Math.max(1, props.timeoutSeconds())));

        this.restClient = RestClient.builder()
                .baseUrl(props.baseUrl())
                .requestFactory(factory)
                .defaultHeader("Authorization", "Bearer " + (props.apiKey() == null ? "" : props.apiKey()))
                .build();
    }

    @Override
    public JsonNode generateJson(LlmRequest request) {
        if (!props.hasApiKey()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "LLM_NOT_CONFIGURED",
                    "OpenAI API 키가 설정되지 않았어요. backend/.env 의 OPENAI_API_KEY 를 확인해주세요.");
        }

        Map<String, Object> body = buildBody(request);
        int attempts = 1 + Math.max(0, props.maxRetries());
        RuntimeException last = null;

        for (int i = 1; i <= attempts; i++) {
            try {
                JsonNode response = restClient.post()
                        .uri("/v1/chat/completions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(body)
                        .retrieve()
                        .body(JsonNode.class);
                return extractJson(response);
            } catch (RestClientException | LlmException e) {
                last = e;
                log.warn("OpenAI 호출 실패 ({}/{}): {}", i, attempts, e.getMessage());
            }
        }
        throw new LlmException("OpenAI 호출이 " + attempts + "회 모두 실패했습니다", last);
    }

    Map<String, Object> buildBody(LlmRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", request.model());
        body.put("messages", List.of(
                Map.of("role", "system", "content", request.system()),
                Map.of("role", "user", "content", request.user())
        ));
        body.put("max_completion_tokens", request.maxTokens());
        body.put("response_format", Map.of(
                "type", "json_schema",
                "json_schema", Map.of(
                        "name", request.schemaName(),
                        "strict", true,
                        "schema", request.schema()
                )
        ));
        if (props.reasoningEffort() != null && !props.reasoningEffort().isBlank()) {
            body.put("reasoning_effort", props.reasoningEffort().strip());
        }
        return body;
    }

    JsonNode extractJson(JsonNode response) {
        if (response == null) {
            throw new LlmException("빈 응답");
        }
        JsonNode choice = response.path("choices").path(0);
        JsonNode message = choice.path("message");
        if (!message.path("refusal").isMissingNode() && !message.path("refusal").isNull()) {
            throw new LlmException("모델이 응답을 거절했습니다: " + message.path("refusal").asText());
        }
        String finishReason = choice.path("finish_reason").asText("");
        if ("length".equals(finishReason)) {
            throw new LlmException("응답이 max_completion_tokens 에서 잘렸습니다");
        }
        String content = message.path("content").asText("");
        if (content.isBlank()) {
            throw new LlmException("응답 내용이 비어 있습니다");
        }
        try {
            return objectMapper.readTree(content);
        } catch (JsonProcessingException e) {
            throw new LlmException("응답 JSON 을 읽을 수 없습니다", e);
        }
    }
}
