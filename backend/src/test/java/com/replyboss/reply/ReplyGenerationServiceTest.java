package com.replyboss.reply;

import com.replyboss.review.ReviewType;
import com.replyboss.store.ToneProfile;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ReplyGenerationServiceTest {

    private final ReplyGenerationService.Context ctx = new ReplyGenerationService.Context(
            "달빛카페", "카페",
            new ToneProfile("해요체", "가끔", List.of("😊"), "3~4문장", List.of("보답할게요"), "오늘도 좋은 하루 되세요!"),
            2, ReviewType.COMPLAINT, List.of("배달 지연"), "배달이 너무 늦었어요 [전화번호]");

    @Test
    void 키워드는_낱말_하나만_나와도_언급한_것으로_본다() {
        assertThat(ReplyGenerationService.mentionsKeyword("배달이 늦어 죄송해요", List.of("배달 지연"))).isTrue();
        assertThat(ReplyGenerationService.mentionsKeyword("이용해 주셔서 감사해요", List.of("배달 지연"))).isFalse();
    }

    @Test
    void 약속_가림표시_키워드누락을_찾아낸다() {
        List<String> problems = ReplyGenerationService.problems(Map.of(
                ReplyTone.POLITE, "배달이 늦어 죄송합니다. 다음에 할인해 드리겠습니다.",
                ReplyTone.FRIENDLY, "[전화번호]로 연락드릴게요. 배달 죄송해요.",
                ReplyTone.CONCISE, "죄송해요."), ctx);

        assertThat(problems).anyMatch(p -> p.startsWith("polite") && p.contains("약속"));
        assertThat(problems).anyMatch(p -> p.startsWith("friendly") && p.contains("가림"));
        assertThat(problems).anyMatch(p -> p.startsWith("concise") && p.contains("키워드"));
    }

    @Test
    void 요청_메시지에_매장_말투와_리뷰를_담는다() {
        String msg = ReplyGenerationService.userMessage(ctx);
        assertThat(msg).contains("해요체").contains("😊").contains("3~4문장").contains("보답할게요")
                .contains("오늘도 좋은 하루 되세요!").contains("COMPLAINT").contains("배달 지연").contains("[전화번호]");
        assertThat(msg).contains("[작성 분량]").contains("polite: 3~4문장").contains("friendly: 3~4문장")
                .contains("concise: 1~2문장");
    }

    @Test
    void 문장_수를_센다() {
        assertThat(ReplyGenerationService.countSentences("치즈볼 맛있게 드셨다니 기뻐요! 😊 다음에도 잘 준비할게요~")).isEqualTo(2);
        assertThat(ReplyGenerationService.countSentences("힘을 얻습니다 ❤️ 다음 주문도 기다릴게요.")).isEqualTo(2);
        assertThat(ReplyGenerationService.countSentences("감사합니다.\n또 찾아주세요")).isEqualTo(2);
        assertThat(ReplyGenerationService.countSentences("배달이 늦어 죄송합니다.")).isEqualTo(1);
    }

    @Test
    void 문장_길이를_벗어나면_문제로_알린다() {
        List<String> problems = ReplyGenerationService.problems(Map.of(
                ReplyTone.POLITE, "배달이 늦어 죄송합니다.",
                ReplyTone.FRIENDLY, "배달이 늦어 죄송해요. 기다리게 해 드렸네요. 더 신경 쓸게요. 오늘도 좋은 하루 되세요!",
                ReplyTone.CONCISE, "배달 늦어 죄송해요. 더 빨리 보내드릴게요. 신경 쓸게요. 오늘도 좋은 하루 되세요!"), ctx);

        assertThat(problems).anyMatch(p -> p.startsWith("polite") && p.contains("1문장") && p.contains("3~4문장"));
        assertThat(problems).noneMatch(p -> p.startsWith("friendly"));
        assertThat(problems).anyMatch(p -> p.startsWith("concise") && p.contains("4문장"));
    }
}
