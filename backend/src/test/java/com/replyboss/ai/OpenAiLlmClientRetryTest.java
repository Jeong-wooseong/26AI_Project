package com.replyboss.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 실제 HTTP 로 재시도 흐름을 확인한다 (OpenAI 대신 로컬 서버). */
class OpenAiLlmClientRetryTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private HttpServer server;

    private static final String TRUNCATED = """
            {"choices":[{"finish_reason":"length","message":{"refusal":null,"content":""}}]}""";
    private static final String OK = """
            {"choices":[{"finish_reason":"stop","message":{"refusal":null,"content":"{\\"type\\":\\"COMPLAINT\\"}"}}]}""";

    @AfterEach
    void stop() {
        if (server != null) {
            server.stop(0);
        }
    }

    private final List<String> seenEffort = new ArrayList<>();

    private OpenAiLlmClient start(List<String> responses, List<Integer> seenMaxTokens, int status) throws IOException {
        return start(responses, seenMaxTokens, List.of(status));
    }

    private OpenAiLlmClient start(List<String> responses, List<Integer> seenMaxTokens, List<Integer> statuses) throws IOException {
        AtomicInteger n = new AtomicInteger();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/chat/completions", exchange -> {
            JsonNode req = mapper.readTree(exchange.getRequestBody());
            seenMaxTokens.add(req.path("max_completion_tokens").asInt());
            seenEffort.add(req.path("reasoning_effort").asText("(없음)"));
            int k = n.getAndIncrement();
            String body = responses.get(Math.min(k, responses.size() - 1));
            int status = statuses.get(Math.min(k, statuses.size() - 1));
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, bytes.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(bytes);
            }
        });
        server.start();
        String base = "http://127.0.0.1:" + server.getAddress().getPort();
        return new OpenAiLlmClient(new OpenAiProperties("key", base, "m1", "m2", "e1", "", 5, 1, null), mapper);
    }

    private static LlmRequest request() {
        return new LlmRequest("m1", "sys", "user", "x", Map.of("type", "object"), 2000);
    }

    @Test
    void 작업별_추론_설정을_보내고_지원하지_않는_모델이면_빼고_다시_보낸다() throws IOException {
        List<Integer> seen = new ArrayList<>();
        OpenAiLlmClient client = start(
                List.of("{\"error\":{\"message\":\"Unsupported parameter: 'reasoning_effort'\"}}", OK), seen, List.of(400, 200));

        JsonNode json = client.generateJson(new LlmRequest("m1", "sys", "user", "x", Map.of("type", "object"), 2000, "low"));

        assertThat(json.path("type").asText()).isEqualTo("COMPLAINT");
        assertThat(seenEffort).containsExactly("low", "(없음)");
    }

    @Test
    void 실패_원인을_이유_코드로_남긴다() throws IOException {
        OpenAiLlmClient truncated = start(List.of(TRUNCATED), new ArrayList<>(), 200);
        assertThatThrownBy(() -> truncated.generateJson(request()))
                .isInstanceOfSatisfying(LlmException.class, e -> assertThat(e.getReason()).isEqualTo("LLM_TRUNCATED"));
        server.stop(0);

        OpenAiLlmClient limited = start(List.of("{}"), new ArrayList<>(), 429);
        assertThatThrownBy(() -> limited.generateJson(request()))
                .isInstanceOfSatisfying(LlmException.class, e -> assertThat(e.getReason()).isEqualTo("LLM_HTTP_429"));
    }

    @Test
    void 잘린_응답은_한도를_두배로_늘려_다시_시도한다() throws IOException {
        List<Integer> seen = new ArrayList<>();
        OpenAiLlmClient client = start(List.of(TRUNCATED, OK), seen, 200);

        JsonNode json = client.generateJson(request());

        assertThat(json.path("type").asText()).isEqualTo("COMPLAINT");
        assertThat(seen).containsExactly(2000, 4000);
    }

    @Test
    void 한도는_상한까지만_늘리고_계속_잘리면_원인을_담아_실패한다() throws IOException {
        List<Integer> seen = new ArrayList<>();
        OpenAiLlmClient client = start(List.of(TRUNCATED), seen, 200);

        assertThatThrownBy(() -> client.generateJson(request()))
                .isInstanceOf(LlmException.class)
                .hasMessageContaining("잘렸습니다");
        assertThat(seen).startsWith(2000, 4000, 8000);
        assertThat(seen).allMatch(t -> t <= OpenAiLlmClient.MAX_COMPLETION_TOKENS_CAP);
    }

    @Test
    void HTTP_오류는_상태코드를_원인에_남긴다() throws IOException {
        List<Integer> seen = new ArrayList<>();
        OpenAiLlmClient client = start(List.of("{\"error\":{\"message\":\"quota\"}}"), seen, 429);

        assertThatThrownBy(() -> client.generateJson(request()))
                .isInstanceOf(LlmException.class)
                .hasMessageContaining("429");
        assertThat(seen).hasSize(2);
    }
}
