package com.replyboss.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.replyboss.common.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * OpenAI Embeddings API (POST /v1/embeddings).
 * 요청: { model, input: [문장...], dimensions }, 응답: data[i].embedding (index 순서).
 * 한 요청에 최대 2,048개 입력이 가능하지만 이 서비스는 수십 개 이하만 보낸다.
 */
@Component
public class OpenAiEmbeddingClient implements EmbeddingClient {

    private static final Logger log = LoggerFactory.getLogger(OpenAiEmbeddingClient.class);
    static final int MAX_INPUTS = 100;

    private final OpenAiProperties props;
    private final SimilarityProperties similarity;
    private final RestClient restClient;

    public OpenAiEmbeddingClient(OpenAiProperties props, SimilarityProperties similarity) {
        this.props = props;
        this.similarity = similarity;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(10));
        factory.setReadTimeout(Duration.ofSeconds(30));
        this.restClient = RestClient.builder()
                .baseUrl(props.baseUrl())
                .requestFactory(factory)
                .defaultHeader("Authorization", "Bearer " + (props.apiKey() == null ? "" : props.apiKey()))
                .build();
    }

    @Override
    public List<float[]> embed(List<String> texts) {
        if (texts.isEmpty()) {
            return List.of();
        }
        if (!props.hasApiKey()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "LLM_NOT_CONFIGURED", "OpenAI API 키가 설정되지 않았습니다.");
        }
        if (texts.size() > MAX_INPUTS) {
            throw new IllegalArgumentException("임베딩은 한 번에 " + MAX_INPUTS + "개까지 요청합니다.");
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", props.embeddingModel());
        // 빈 문자열은 API 가 받지 않으므로 공백 하나로 바꾼다
        body.put("input", texts.stream().map(t -> t == null || t.isBlank() ? " " : t).toList());
        if (similarity.dimensions() > 0) {
            body.put("dimensions", similarity.dimensions());
        }
        try {
            JsonNode response = restClient.post()
                    .uri("/v1/embeddings")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
            return parse(response, texts.size());
        } catch (RestClientResponseException e) {
            log.warn("임베딩 호출 실패: HTTP {}", e.getStatusCode().value());
            throw new LlmException("임베딩 호출 실패 (HTTP " + e.getStatusCode().value() + ")", e,
                    "LLM_HTTP_" + e.getStatusCode().value());
        } catch (RestClientException e) {
            log.warn("임베딩 호출 실패: {}", e.getMessage());
            throw new LlmException("임베딩 호출 실패", e, "LLM_TIMEOUT");
        }
    }

    static List<float[]> parse(JsonNode response, int expected) {
        JsonNode data = response == null ? null : response.path("data");
        if (data == null || !data.isArray() || data.size() != expected) {
            throw new LlmException("임베딩 응답 형식이 올바르지 않습니다", null, "LLM_INVALID");
        }
        List<float[]> out = new ArrayList<>(java.util.Collections.nCopies(expected, (float[]) null));
        for (JsonNode item : data) {
            int index = item.path("index").asInt(-1);
            JsonNode vector = item.path("embedding");
            if (index < 0 || index >= expected || !vector.isArray()) {
                throw new LlmException("임베딩 응답 형식이 올바르지 않습니다", null, "LLM_INVALID");
            }
            float[] v = new float[vector.size()];
            for (int i = 0; i < v.length; i++) {
                v[i] = (float) vector.get(i).asDouble();
            }
            out.set(index, v);
        }
        return out;
    }
}
