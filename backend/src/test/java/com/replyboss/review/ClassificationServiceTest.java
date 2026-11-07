package com.replyboss.review;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.replyboss.ai.LlmException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ClassificationServiceTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private JsonNode json(String s) throws Exception {
        return mapper.readTree(s);
    }

    @Test
    void 정상_응답을_읽는다() throws Exception {
        ClassificationResult r = ClassificationService.parse(json("""
                {"type":"COMPLAINT","sentiment":"NEGATIVE","keywords":["배달 지연","식은 음식"],"confidence":0.92}
                """));
        assertThat(r.type()).isEqualTo(ReviewType.COMPLAINT);
        assertThat(r.sentiment()).isEqualTo(Sentiment.NEGATIVE);
        assertThat(r.keywords()).containsExactly("배달 지연", "식은 음식");
        assertThat(r.confidence()).isEqualTo(0.92);
    }

    @Test
    void 키워드는_가림표시와_중복을_빼고_3개까지() throws Exception {
        ClassificationResult r = ClassificationService.parse(json("""
                {"type":"PRAISE","sentiment":"POSITIVE",
                 "keywords":["라떼","[전화번호]","라떼"," ","크로플","포장","케이크"],"confidence":1.7}
                """));
        assertThat(r.keywords()).containsExactly("라떼", "크로플", "포장");
        assertThat(r.confidence()).isEqualTo(1.0);
    }

    @Test
    void 평점만이나_알수없는_유형은_거부한다() throws Exception {
        assertThatThrownBy(() -> ClassificationService.parse(json("""
                {"type":"RATING_ONLY","sentiment":"POSITIVE","keywords":[],"confidence":1}
                """))).isInstanceOf(LlmException.class);
        assertThatThrownBy(() -> ClassificationService.parse(json("""
                {"type":"칭찬","sentiment":"POSITIVE","keywords":[],"confidence":1}
                """))).isInstanceOf(LlmException.class);
    }
}
