package com.replyboss.reply;

import com.replyboss.store.ToneProfile;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class RatingOnlyReplyServiceTest {

    private final ToneProfile tone = new ToneProfile(
            "해요체", "가끔", List.of("😊"), "2~3문장", List.of("감사드려요"), "오늘도 좋은 하루 되세요!");

    private ToneProfile withClosing(String closing) {
        return new ToneProfile("해요체", "없음", List.of(), "2~3문장", List.of(), closing);
    }

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
    void 템플릿에_같은_뜻의_감사_인사가_있으면_마무리_인사를_붙이지_않는다() {
        assertThat(RatingOnlyReplyService.applyTone("좋은 별점 남겨주셔서 감사드려요.", 5, withClosing("이용해주셔서 감사합니다~")))
                .isEqualTo("좋은 별점 남겨주셔서 감사드려요.");
        assertThat(RatingOnlyReplyService.applyTone("찾아주셔서 고마워요.", 4, withClosing("감사합니다!")))
                .isEqualTo("찾아주셔서 고마워요.");
    }

    @Test
    void 뜻이_다른_인사는_붙인다() {
        assertThat(RatingOnlyReplyService.applyTone("좋은 별점 남겨주셔서 감사드려요.", 5, withClosing("또 찾아주세요!")))
                .isEqualTo("좋은 별점 남겨주셔서 감사드려요. 또 찾아주세요!");
    }

    @Test
    void 낮은_별점_사과_답글에는_아무것도_붙이지_않는다() {
        assertThat(RatingOnlyReplyService.applyTone("죄송해요.", 1, tone)).isEqualTo("죄송해요.");
    }

    @Test
    void 톤_프로필이_없으면_템플릿_그대로() {
        assertThat(RatingOnlyReplyService.applyTone("감사드려요.", 5, null)).isEqualTo("감사드려요.");
    }

    private ToneProfile withLength(String length, String formality, List<String> phrases) {
        return new ToneProfile(formality, "없음", List.of(), length, phrases, "오늘도 좋은 하루 되세요!");
    }

    @Test
    void 한두_문장이면_마무리_인사를_생략한다() {
        assertThat(RatingOnlyReplyService.applyTone("찾아주셔서 감사해요. 또 뵐게요.", 5, withLength("1~2문장", "해요체", List.of())))
                .isEqualTo("찾아주셔서 감사해요. 또 뵐게요.");
    }

    @Test
    void 세네_문장이면_자주_쓰는_표현을_한_문장_덧붙인다() {
        assertThat(RatingOnlyReplyService.applyTone("좋은 별점 감사드려요. 힘이 나요.", 5,
                withLength("3~4문장", "해요체", List.of("감사드려요", "보답할게요"))))
                .isEqualTo("좋은 별점 감사드려요. 힘이 나요. 보답할게요. 오늘도 좋은 하루 되세요!");
    }

    @Test
    void 세네_문장인데_쓸_표현이_없으면_별점별_기본_문장을_쓴다() {
        assertThat(RatingOnlyReplyService.applyTone("죄송합니다. 알려주시면 확인하겠습니다.", 1, withLength("3~4문장", "하십시오체", List.of())))
                .isEqualTo("죄송합니다. 알려주시면 확인하겠습니다. 같은 일이 반복되지 않도록 더 세심하게 살피겠습니다.");
        assertThat(RatingOnlyReplyService.applyTone("감사합니다. 힘이 됩니다.", 5, withLength("3~4문장", "하십시오체", List.of())))
                .isEqualTo("감사합니다. 힘이 됩니다. 앞으로도 변함없는 맛으로 보답하겠습니다. 오늘도 좋은 하루 되세요!");
    }
}
