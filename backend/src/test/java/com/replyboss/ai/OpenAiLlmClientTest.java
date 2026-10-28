package com.replyboss.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OpenAiLlmClientTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private OpenAiLlmClient client(String reasoningEffort) {
        return new OpenAiLlmClient(new OpenAiProperties(
                "key", "http://localhost:1", "m1", "m2", "e1", reasoningEffort, 1, 0), mapper);
    }

    @Test
    void 요청_본문에_strict_json_schema를_넣는다() {
        Map<String, Object> schema = Schemas.object(Schemas.props("a", Schemas.string()));
        Map<String, Object> body = client("").buildBody(new LlmRequest("m1", "sys", "hello", "test_schema", schema, 100));

        assertThat(body).containsEntry("model", "m1").containsEntry("max_completion_tokens", 100);
        assertThat(body.containsKey("reasoning_effort")).isEqualTo(false);
        assertThat(body.containsKey("temperature")).isEqualTo(false);

        @SuppressWarnings("unchecked")
        Map<String, Object> format = (Map<String, Object>) body.get("response_format");
        assertThat(format).containsEntry("type", "json_schema");
        @SuppressWarnings("unchecked")
        Map<String, Object> jsonSchema = (Map<String, Object>) format.get("json_schema");
        assertThat(jsonSchema).containsEntry("name", "test_schema").containsEntry("strict", true).containsEntry("schema", schema);
        assertThat(schema).containsEntry("additionalProperties", false);
    }

    @Test
    void reasoning_effort는_설정했을_때만_보낸다() {
        Map<String, Object> body = client("low").buildBody(new LlmRequest("m1", "s", "u", "x",
                Schemas.object(Schemas.props("a", Schemas.string())), 100));
        assertThat(body).containsEntry("reasoning_effort", "low");
    }

    @Test
    void message_content의_JSON을_읽는다() throws Exception {
        JsonNode response = mapper.readTree("""
                {"choices":[{"finish_reason":"stop","message":{"role":"assistant","refusal":null,
                 "content":"{\\"type\\":\\"PRAISE\\"}"}}]}
                """);
        assertThat(client("").extractJson(response).path("type").asText()).isEqualTo("PRAISE");
    }

    @Test
    void 거절이나_잘린_응답은_실패로_본다() throws Exception {
        assertThatThrownBy(() -> client("").extractJson(mapper.readTree("""
                {"choices":[{"finish_reason":"stop","message":{"refusal":"I can't help","content":null}}]}
                """))).isInstanceOf(LlmException.class);
        assertThatThrownBy(() -> client("").extractJson(mapper.readTree("""
                {"choices":[{"finish_reason":"length","message":{"refusal":null,"content":"{\\"ty"}}]}
                """))).isInstanceOf(LlmException.class);
    }
}
