package com.replyboss.report;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.replyboss.ai.EmbeddingClient;
import com.replyboss.ai.LlmClient;
import com.replyboss.ai.LlmException;
import com.replyboss.ai.LlmRequest;
import com.replyboss.common.ApiException;
import com.replyboss.report.ReportDtos.ReportResponse;
import com.replyboss.report.ReportDtos.WeeklyStats;
import com.replyboss.review.Platform;
import com.replyboss.review.ReviewDtos.CompleteReplyRequest;
import com.replyboss.review.ReviewDtos.ReviewBatchRequest;
import com.replyboss.review.ReviewDtos.ReviewItem;
import com.replyboss.review.ReviewDtos.ReviewResponse;
import com.replyboss.review.ReviewService;
import com.replyboss.store.StoreDtos.StoreRequest;
import com.replyboss.store.StoreDtos.ToneUpdateRequest;
import com.replyboss.store.StoreService;
import com.replyboss.store.ToneProfile;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@SpringBootTest
class ReportServiceTest {

    static final LocalDate MONDAY = LocalDate.of(2026, 10, 12);

    @Autowired
    ReportService reportService;
    @Autowired
    ReviewService reviewService;
    @Autowired
    StoreService storeService;
    @Autowired
    ObjectMapper mapper;
    @MockitoBean
    LlmClient llmClient;
    @MockitoBean
    EmbeddingClient embeddingClient;

    Long storeId;

    @BeforeEach
    void setUp() {
        reset(llmClient, embeddingClient);
        storeId = storeService.create(new StoreRequest("달빛카페", "카페")).id();
        storeService.updateTone(storeId, new ToneUpdateRequest(
                new ToneProfile("해요체", "없음", List.of(), "2~3문장", List.of(), ""), List.of("a", "b", "c")));
    }

    private ReviewResponse add(String classification, int rating, String content, LocalDate writtenAt) throws Exception {
        when(llmClient.generateJson(any())).thenReturn(mapper.readTree(classification));
        return reviewService.createBatch(storeId, new ReviewBatchRequest(
                Platform.BAEMIN, List.of(new ReviewItem(rating, content, writtenAt)))).get(0);
    }

    private static String complaint(String... keywords) {
        return "{\"type\":\"COMPLAINT\",\"sentiment\":\"NEGATIVE\",\"keywords\":[\""
                + String.join("\",\"", keywords) + "\"],\"confidence\":0.9}";
    }

    private void seed() throws Exception {
        // 이번 주 (10/12 ~ 10/18)
        add(complaint("배달 지연"), 2, "배달이 한 시간 걸렸어요", MONDAY);
        add(complaint("배달 지연", "식은 음식"), 1, "배달이 너무 늦어서 다 식었어요", MONDAY.plusDays(2));
        add(complaint("양 부족"), 3, "양이 적어요", MONDAY.plusDays(3));
        add("{\"type\":\"PRAISE\",\"sentiment\":\"POSITIVE\",\"keywords\":[\"라떼\"],\"confidence\":0.9}", 5, "라떼 맛있어요", MONDAY.plusDays(6));
        // 지난주
        add(complaint("양 부족"), 2, "양이 너무 적어요", MONDAY.minusDays(3));
        add(complaint("양 부족"), 3, "양이 아쉬워요", MONDAY.minusDays(1));
        // 다음 주 (집계 제외)
        add(complaint("배달 지연"), 1, "늦어요", MONDAY.plusDays(7));
    }

    @Test
    void 불만_주제_순위와_전주_대비_변화_대표_리뷰를_서버에서_집계한다() throws Exception {
        seed();
        WeeklyStats s = reportService.report(storeId, MONDAY.plusDays(4)).stats();

        assertThat(s.weekStart()).isEqualTo(MONDAY);
        assertThat(s.weekEnd()).isEqualTo(MONDAY.plusDays(6));
        assertThat(s.total()).isEqualTo(4);
        assertThat(s.previousTotal()).isEqualTo(2);
        assertThat(s.avgRating()).isEqualTo(2.8);
        assertThat(s.complaints()).isEqualTo(3);
        assertThat(s.complaintRate()).isEqualTo(75);
        assertThat(s.topics()).extracting(t -> t.topic() + ":" + t.count() + ":" + t.previousCount() + ":" + t.change())
                .containsExactly("배달 지연:2:0:2", "식은 음식:1:0:1", "양 부족:1:2:-1");
        assertThat(s.representatives()).hasSize(3);
        assertThat(s.representatives().get(0).topic()).isEqualTo("배달 지연");
        assertThat(s.representatives().get(0).rating()).isEqualTo(1); // 별점 낮은 리뷰 우선
        assertThat(s.replies().target()).isEqualTo(4);
        assertThat(s.replies().completed()).isZero();
        assertThat(s.replies().completionRate()).isZero();
        assertThat(s.replies().editRate()).isNull();
    }

    @Test
    void AI_요약은_집계_숫자만_쓰고_다르면_다시_만든다() throws Exception {
        seed();
        reset(llmClient);
        when(llmClient.generateJson(any())).thenReturn(
                mapper.readTree("""
                        {"summary":"이번 주 리뷰는 4건이고 불만은 80%입니다.","suggestions":["배달 시간을 확인해 볼 만합니다."]}
                        """),
                mapper.readTree("""
                        {"summary":"이번 주 리뷰 4건 중 불만이 3건(75%)이며, 배달 지연이 2건으로 가장 많았습니다.","suggestions":["배달 지연이 생긴 시간대를 확인해 볼 만합니다.","양 부족 의견은 지난주 2건에서 줄었습니다."]}
                        """));

        ReportResponse r = reportService.generateInsight(storeId, MONDAY);

        ArgumentCaptor<LlmRequest> captor = ArgumentCaptor.forClass(LlmRequest.class);
        verify(llmClient, times(2)).generateJson(captor.capture());
        assertThat(captor.getAllValues().get(0).user()).contains("이번 주 리뷰: 4건").contains("배달 지연: 2건 / 0건")
                .contains("[대표 불만 리뷰]");
        assertThat(captor.getAllValues().get(1).user()).contains("집계에 없는 숫자를 씀: 80");
        assertThat(r.insight().summary()).contains("75%");
        assertThat(r.insight().stale()).isFalse();

        // 다시 조회하면 저장된 요약이 나오고, 리뷰가 늘면 stale
        assertThat(reportService.report(storeId, MONDAY).insight().suggestions()).hasSize(2);
        add(complaint("배달 지연"), 2, "또 늦었어요", MONDAY.plusDays(5));
        assertThat(reportService.report(storeId, MONDAY).insight().stale()).isTrue();
    }

    @Test
    void 숫자가_계속_맞지_않으면_실패하고_리뷰가_없으면_요약하지_않는다() throws Exception {
        assertThatThrownBy(() -> reportService.generateInsight(storeId, MONDAY)).isInstanceOf(ApiException.class);
        seed();
        reset(llmClient);
        when(llmClient.generateJson(any())).thenReturn(mapper.readTree("""
                {"summary":"불만이 99건입니다.","suggestions":[]}
                """));
        assertThatThrownBy(() -> reportService.generateInsight(storeId, MONDAY)).isInstanceOf(LlmException.class);
    }

    @Test
    void 작성_완료와_수정률을_센다() throws Exception {
        ReviewResponse rating = reviewService.createBatch(storeId, new ReviewBatchRequest(
                Platform.BAEMIN, List.of(new ReviewItem(5, "", MONDAY)))).get(0);
        reviewService.completeReply(rating.id(), new CompleteReplyRequest(rating.replies().get(0).id(), "직접 고친 답글입니다."));
        var s = reportService.report(storeId, MONDAY).stats().replies();
        assertThat(s.completed()).isEqualTo(1);
        assertThat(s.edited()).isEqualTo(1);
        assertThat(s.completionRate()).isEqualTo(100);
        assertThat(s.editRate()).isEqualTo(100);
    }
}
