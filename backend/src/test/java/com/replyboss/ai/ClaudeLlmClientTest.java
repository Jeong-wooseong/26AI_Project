package com.replyboss.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ClaudeLlmClientTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final ClaudeLlmClient client = new ClaudeLlmClient(
            new ClaudeProperties("key", "http://localhost:1", "2023-06-01", "m1", "m2", 1, 0), mapper);

    @Test
    void 요청_본문에_구조화_출력_형식을_넣는다() {
        Map<String, Object> schema = Schemas.object(Schemas.props("a", Schemas.string()));
        Map<String, Object> body = client.buildBody(new LlmRequest("m1", "sys", "hello", schema, 100, 0.0));

        assertThat(body).containsEntry("model", "m1").containsEntry("system", "sys").containsEntry("max_tokens", 100);
        @SuppressWarnings("unchecked")
        Map<String, Object> format = (Map<String, Object>) ((Map<String, Object>) body.get("output_config")).get("format");
        assertThat(format).containsEntry("type", "json_schema").containsEntry("schema", schema);
        assertThat(schema).containsEntry("additionalProperties", false);
    }

    @Test
    void text_블록의_JSON을_읽는다() throws Exception {
        JsonNode response = mapper.readTree("""
                {"stop_reason":"end_turn","content":[{"type":"text","text":"{\\"type\\":\\"PRAISE\\"}"}]}
                """);
        assertThat(client.extractJson(response).path("type").asText()).isEqualTo("PRAISE");
    }

    @Test
    void 거절이나_잘린_응답은_실패로_본다() throws Exception {
        assertThatThrownBy(() -> client.extractJson(mapper.readTree("""
                {"stop_reason":"refusal","content":[]}
                """))).isInstanceOf(LlmException.class);
        assertThatThrownBy(() -> client.extractJson(mapper.readTree("""
                {"stop_reason":"max_tokens","content":[{"type":"text","text":"{\\"ty"}]}
                """))).isInstanceOf(LlmException.class);
    }
}
