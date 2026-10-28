package com.replyboss.reply;

import com.replyboss.store.ToneProfile;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class RatingOnlyReplyServiceTest {

    private final ToneProfile tone = new ToneProfile(
            "해요체", "가끔", List.of("😊"), "2~3문장", List.of("감사드려요"), "오늘도 좋은 하루 되세요!");

    @Test
    void 높은_별점은_이모지와_마무리_인사를_붙인다() {
        assertThat(RatingOnlyReplyService.applyTone("감사드려요.", 5, tone))
                .isEqualTo("감사드려요. 😊 오늘도 좋은 하루 되세요!");
    }

    @Test
    void 세_점은_마무리_인사만_붙인다() {
        assertThat(RatingOnlyReplyService.applyTone("알려주세요.", 3, tone))
                .isEqualTo("알려주세요. 오늘도 좋은 하루 되세요!");
    }

    @Test
    void 낮은_별점_사과_답글에는_아무것도_붙이지_않는다() {
        assertThat(RatingOnlyReplyService.applyTone("죄송해요.", 1, tone)).isEqualTo("죄송해요.");
    }

    @Test
    void 톤_프로필이_없으면_템플릿_그대로() {
        assertThat(RatingOnlyReplyService.applyTone("감사드려요.", 5, null)).isEqualTo("감사드려요.");
    }
}
