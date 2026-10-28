package com.replyboss.store;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ToneProfileServiceTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private final List<String> samples = List.of(
            "소중한 리뷰 감사드려요~ 다음에도 맛있는 라떼로 보답할게요! 오늘도 좋은 하루 되세요!",
            "늦어서 정말 죄송해요ㅠㅠ 앞으로 조리 시간 더 신경 쓸게요. 감사드려요!",
            "크로플 맛있게 드셨다니 기뻐요 😊 또 들러주세요. 오늘도 좋은 하루 되세요!"
    );

    @Test
    void 예시에_없는_표현과_이모지는_버린다() throws Exception {
        ToneProfile tone = ToneProfileService.sanitize(mapper.readTree("""
                {"formality":"해요체","emojiLevel":"자주","emojiExamples":["😊","🙏"],
                 "length":"2~3문장","phrases":["감사드려요","보답할게요","사랑합니다"],
                 "closing":"오늘도 좋은 하루 되세요!"}
                """), samples);

        assertThat(tone.phrases()).containsExactly("감사드려요", "보답할게요");
        assertThat(tone.emojiExamples()).containsExactly("😊");
        assertThat(tone.emojiLevel()).isEqualTo("자주");
        assertThat(tone.closing()).isEqualTo("오늘도 좋은 하루 되세요!");
    }

    @Test
    void 이모지가_없으면_없음으로_맞추고_잘못된_값은_기본값() throws Exception {
        ToneProfile tone = ToneProfileService.sanitize(mapper.readTree("""
                {"formality":"존댓말","emojiLevel":"자주","emojiExamples":[],
                 "length":"10문장","phrases":[],"closing":"감사합니다 또 오세요"}
                """), samples);

        assertThat(tone.formality()).isEqualTo("해요체");
        assertThat(tone.emojiLevel()).isEqualTo("없음");
        assertThat(tone.length()).isEqualTo("2~3문장");
        assertThat(tone.closing()).isEmpty();
    }
}
