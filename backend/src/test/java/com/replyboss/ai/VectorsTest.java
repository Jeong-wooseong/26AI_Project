package com.replyboss.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class VectorsTest {

    @Test
    void 코사인_유사도와_저장_형식() {
        float[] a = {1, 0, 0};
        float[] b = {1, 1, 0};
        assertThat(Vectors.cosine(a, a)).isEqualTo(1.0, org.assertj.core.data.Offset.offset(1e-9));
        assertThat(Vectors.cosine(a, b)).isEqualTo(Math.sqrt(0.5), org.assertj.core.data.Offset.offset(1e-6));
        assertThat(Vectors.cosine(a, new float[]{1, 0})).isZero(); // 길이가 다르면 0
        assertThat(Vectors.maxCosine(a, List.of(b, a))).isEqualTo(1.0, org.assertj.core.data.Offset.offset(1e-9));
        assertThat(Vectors.fromText(Vectors.toText(b))).containsExactly(1f, 1f, 0f);
        assertThat(Vectors.fromText("[]")).isNull();
        assertThat(Vectors.fromText("[a,b]")).isNull();
    }

    @Test
    void 임베딩_응답을_index_순서로_읽는다() throws Exception {
        var json = new ObjectMapper().readTree("""
                {"object":"list","data":[
                  {"object":"embedding","index":1,"embedding":[0.0,1.0]},
                  {"object":"embedding","index":0,"embedding":[1.0,0.0]}
                ],"model":"text-embedding-3-small"}
                """);
        List<float[]> out = OpenAiEmbeddingClient.parse(json, 2);
        assertThat(out.get(0)).containsExactly(1f, 0f);
        assertThat(out.get(1)).containsExactly(0f, 1f);
        assertThatThrownBy(() -> OpenAiEmbeddingClient.parse(json, 3)).isInstanceOf(LlmException.class);
    }
}
