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
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

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

    /** 잘림(finish_reason=length) 때 늘려 줄 수 있는 최대 토큰 한도 */
    static final int MAX_COMPLETION_TOKENS_CAP = 8000;

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
                    "OpenAI API 키가 설정되지 않았습니다. backend/.env의 OPENAI_API_KEY를 확인하십시오.");
        }

        int maxTokens = request.maxTokens();
        String effort = effortFor(request);
        int attempts = 1 + Math.max(0, props.maxRetries());
        RuntimeException last = null;

        for (int i = 1; i <= attempts; i++) {
            try {
                JsonNode response = restClient.post()
                        .uri("/v1/chat/completions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(buildBody(request, maxTokens, effort))
                        .retrieve()
                        .body(JsonNode.class);
                return extractJson(response);
            } catch (LlmTruncatedException e) {
                last = e;
                int next = Math.min(maxTokens * 2, MAX_COMPLETION_TOKENS_CAP);
                log.warn("OpenAI 호출 실패 ({}/{}): {} (한도 {} → {} 로 다시 시도)", i, attempts, e.getMessage(), maxTokens, next);
                if (next > maxTokens) {
                    maxTokens = next;
                    // 한도를 늘린 재시도는 재시도 횟수에 넣지 않는다 (같은 한도로는 같은 결과가 나오므로)
                    if (i == attempts) {
                        attempts++;
                    }
                }
            } catch (RestClientResponseException e) {
                last = e;
                String body = abbreviate(e.getResponseBodyAsString());
                log.warn("OpenAI 호출 실패 ({}/{}): HTTP {} {}", i, attempts, e.getStatusCode().value(), body);
                // 모델이 reasoning_effort 를 지원하지 않으면 빼고 한 번 더 보낸다
                if (e.getStatusCode().value() == 400 && effort != null && body.contains("reasoning")) {
                    log.warn("reasoning_effort={} 를 빼고 다시 시도합니다", effort);
                    effort = null;
                    if (i == attempts) {
                        attempts++;
                    }
                }
            } catch (RestClientException | LlmException e) {
                last = e;
                log.warn("OpenAI 호출 실패 ({}/{}): {}", i, attempts, e.getMessage());
            }
        }
        throw new LlmException("OpenAI 호출이 " + attempts + "회 모두 실패했습니다 (마지막 원인: "
                + (last == null ? "알 수 없음" : last.getMessage()) + ")", last, reasonOf(last));
    }

    /** 작업별 설정이 있으면 그것을, 없으면 전역 설정을 쓴다. 빈 문자열은 '보내지 않음' */
    private String effortFor(LlmRequest request) {
        String effort = request.reasoningEffort() != null ? request.reasoningEffort() : props.reasoningEffort();
        return effort == null || effort.isBlank() ? null : effort.strip();
    }

    /** 마지막 실패 원인 → 화면에 보여줄 이유 코드 */
    static String reasonOf(Throwable last) {
        if (last instanceof LlmException e) {
            return e.getReason();
        }
        if (last instanceof RestClientResponseException e) {
            return "LLM_HTTP_" + e.getStatusCode().value();
        }
        if (last instanceof ResourceAccessException) {
            return "LLM_TIMEOUT";
        }
        return "LLM_FAILED";
    }

    private static String abbreviate(String text) {
        if (text == null) {
            return "";
        }
        String oneLine = text.replaceAll("\\s+", " ").strip();
        return oneLine.length() > 300 ? oneLine.substring(0, 300) + "…" : oneLine;
    }

    Map<String, Object> buildBody(LlmRequest request) {
        return buildBody(request, request.maxTokens(), effortFor(request));
    }

    Map<String, Object> buildBody(LlmRequest request, int maxTokens, String effort) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", request.model());
        body.put("messages", List.of(
                Map.of("role", "system", "content", request.system()),
                Map.of("role", "user", "content", request.user())
        ));
        body.put("max_completion_tokens", maxTokens);
        body.put("response_format", Map.of(
                "type", "json_schema",
                "json_schema", Map.of(
                        "name", request.schemaName(),
                        "strict", true,
                        "schema", request.schema()
                )
        ));
        if (effort != null) {
            body.put("reasoning_effort", effort);
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
            throw new LlmException("모델이 응답을 거절했습니다: " + message.path("refusal").asText(), null, "LLM_REFUSED");
        }
        String finishReason = choice.path("finish_reason").asText("");
        if ("length".equals(finishReason)) {
            throw new LlmTruncatedException("응답이 max_completion_tokens 에서 잘렸습니다");
        }
        String content = message.path("content").asText("");
        if (content.isBlank()) {
            throw new LlmException("응답 내용이 비어 있습니다", null, "LLM_INVALID");
        }
        try {
            return objectMapper.readTree(content);
        } catch (JsonProcessingException e) {
            throw new LlmException("응답 JSON 을 읽을 수 없습니다", e, "LLM_INVALID");
        }
    }
}
