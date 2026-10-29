package com.replyboss.review;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.replyboss.ai.LlmClient;
import com.replyboss.ai.LlmException;
import com.replyboss.ai.LlmRequest;
import com.replyboss.reply.ReplyTone;
import com.replyboss.review.ReviewDtos.CompleteReplyRequest;
import com.replyboss.review.ReviewDtos.DuplicateCheckItem;
import com.replyboss.review.ReviewDtos.DuplicateCheckRequest;
import com.replyboss.review.ReviewDtos.ReviewBatchRequest;
import com.replyboss.review.ReviewDtos.ReviewItem;
import com.replyboss.review.ReviewDtos.ReviewResponse;
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
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 리뷰 입력 → 마스킹 → 분기 → 분류 → 저장 흐름. LLM 은 가짜로 바꾸고 H2 에서 돈다.
 */
@SpringBootTest
class ReviewFlowTest {

    @Autowired
    ReviewService reviewService;
    @Autowired
    StoreService storeService;
    @Autowired
    ObjectMapper mapper;

    @MockitoBean
    LlmClient llmClient;

    Long storeId;

    @BeforeEach
    void setUp() {
        reset(llmClient);
        storeId = storeService.create(new StoreRequest("달빛카페", "카페")).id();
        storeService.updateTone(storeId, new ToneUpdateRequest(
                new ToneProfile("해요체", "가끔", List.of("😊"), "2~3문장", List.of("감사드려요"), "오늘도 좋은 하루 되세요!"),
                List.of("예시1", "예시2", "예시3")));
    }

    @Test
    void 본문이_없으면_LLM_없이_평점만으로_분류하고_템플릿_답글을_만든다() {
        List<ReviewResponse> result = reviewService.createBatch(storeId, new ReviewBatchRequest(
                Platform.COUPANG_EATS, List.of(new ReviewItem(5, "   "))));

        ReviewResponse r = result.get(0);
        assertThat(r.type()).isEqualTo(ReviewType.RATING_ONLY);
        assertThat(r.sentiment()).isEqualTo(Sentiment.POSITIVE);
        assertThat(r.status()).isEqualTo(ReviewStatus.CLASSIFIED);
        assertThat(r.replies()).hasSize(1);
        assertThat(r.replies().get(0).tone()).isEqualTo(ReplyTone.TEMPLATE);
        assertThat(r.replies().get(0).content()).endsWith("오늘도 좋은 하루 되세요!");
        verify(llmClient, never()).generateJson(any());
    }

    @Test
    void 본문이_있으면_마스킹한_뒤_분류해_저장한다() throws Exception {
        when(llmClient.generateJson(any())).thenReturn(mapper.readTree("""
                {"type":"COMPLAINT","sentiment":"NEGATIVE","keywords":["배달 지연"],"confidence":0.9}
                """));

        List<ReviewResponse> result = reviewService.createBatch(storeId, new ReviewBatchRequest(
                Platform.BAEMIN, List.of(new ReviewItem(2, "배달이 늦었어요. 010-1234-5678로 연락 주세요"))));

        ReviewResponse r = result.get(0);
        assertThat(r.maskedContent()).isEqualTo("배달이 늦었어요. [전화번호]로 연락 주세요");
        assertThat(r.type()).isEqualTo(ReviewType.COMPLAINT);
        assertThat(r.keywords()).containsExactly("배달 지연");

        ArgumentCaptor<LlmRequest> captor = ArgumentCaptor.forClass(LlmRequest.class);
        verify(llmClient).generateJson(captor.capture());
        assertThat(captor.getValue().user()).contains("[전화번호]").doesNotContain("010-1234-5678");
        // 분류는 추론을 적게 쓰도록 작업별 설정(기본 low)을 함께 보낸다
        assertThat(captor.getValue().reasoningEffort()).isEqualTo("low");
    }

    @Test
    void 실패_이유_코드를_저장한다() {
        when(llmClient.generateJson(any())).thenThrow(new com.replyboss.ai.LlmTruncatedException("잘림"));

        ReviewResponse failed = reviewService.createBatch(storeId, new ReviewBatchRequest(
                Platform.BAEMIN, List.of(new ReviewItem(2, "배달이 늦어서 그런지 맛이 덜했어요")))).get(0);

        assertThat(failed.status()).isEqualTo(ReviewStatus.FAILED);
        assertThat(failed.failureCode()).isEqualTo("LLM_TRUNCATED");
    }

    @Test
    void 분류에_실패하면_FAILED로_저장하고_다시_시도할_수_있다() throws Exception {
        when(llmClient.generateJson(any())).thenThrow(new LlmException("timeout"));

        ReviewResponse failed = reviewService.createBatch(storeId, new ReviewBatchRequest(
                Platform.NAVER_MAP, List.of(new ReviewItem(3, "주차 되나요?")))).get(0);
        assertThat(failed.status()).isEqualTo(ReviewStatus.FAILED);
        assertThat(failed.failureCode()).isEqualTo("LLM_FAILED");

        // 다시 시도도 실패하면 오류를 돌려준다
        assertThatThrownBy(() -> reviewService.reclassify(failed.id())).isInstanceOf(LlmException.class);

        reset(llmClient);
        when(llmClient.generateJson(any())).thenReturn(mapper.readTree("""
                {"type":"INQUIRY","sentiment":"NEUTRAL","keywords":["주차"],"confidence":0.95}
                """));
        ReviewResponse retried = reviewService.reclassify(failed.id());
        assertThat(retried.status()).isEqualTo(ReviewStatus.CLASSIFIED);
        assertThat(retried.type()).isEqualTo(ReviewType.INQUIRY);
        assertThat(retried.failureCode()).isNull();
    }

    @Test
    void 오늘_날짜와_유형으로_목록을_거른다() throws Exception {
        when(llmClient.generateJson(any())).thenReturn(mapper.readTree("""
                {"type":"PRAISE","sentiment":"POSITIVE","keywords":["라떼"],"confidence":0.9}
                """));
        reviewService.createBatch(storeId, new ReviewBatchRequest(Platform.BAEMIN, List.of(
                new ReviewItem(5, "라떼 맛있어요"),
                new ReviewItem(1, ""))));

        List<ReviewResponse> today = reviewService.list(storeId, LocalDate.now(), null);
        assertThat(today).hasSize(2);
        assertThat(today.get(0).type()).isEqualTo(ReviewType.RATING_ONLY); // 최신순
        assertThat(today.get(0).replies()).hasSize(1);

        assertThat(reviewService.list(storeId, LocalDate.now(), ReviewType.PRAISE)).hasSize(1);
        assertThat(reviewService.list(storeId, LocalDate.now().minusDays(1), null)).isEmpty();
        verify(llmClient, times(1)).generateJson(any());
    }

    @Test
    void 작성일을_함께_저장하고_돌려준다() {
        LocalDate written = LocalDate.now().minusDays(3);
        ReviewResponse r = reviewService.createBatch(storeId, new ReviewBatchRequest(
                Platform.YOGIYO, List.of(new ReviewItem(4, "", written)))).get(0);

        assertThat(r.writtenAt()).isEqualTo(written);
        assertThat(reviewService.list(storeId, LocalDate.now(), null).get(0).writtenAt()).isEqualTo(written);
    }

    @Test
    void 이미_등록된_본문은_마스킹_후_같은_출처에서만_중복으로_찾는다() throws Exception {
        when(llmClient.generateJson(any())).thenReturn(mapper.readTree("""
                {"type":"COMPLAINT","sentiment":"NEGATIVE","keywords":["배달"],"confidence":0.9}
                """));
        reviewService.createBatch(storeId, new ReviewBatchRequest(Platform.BAEMIN, List.of(
                new ReviewItem(2, "배달이 늦었어요 010-1111-2222"),
                new ReviewItem(5, ""))));

        List<Integer> dup = reviewService.findDuplicates(storeId, new DuplicateCheckRequest(List.of(
                new DuplicateCheckItem(Platform.BAEMIN, "배달이 늦었어요 010-3333-4444"), // 마스킹하면 같은 본문
                new DuplicateCheckItem(Platform.COUPANG_EATS, "배달이 늦었어요 010-1111-2222"), // 출처가 다름
                new DuplicateCheckItem(Platform.BAEMIN, ""), // 별점만은 구별 불가 → 중복 아님
                new DuplicateCheckItem(Platform.BAEMIN, "처음 보는 리뷰"))));

        assertThat(dup).containsExactly(0);
    }

    @Test
    void 불만_리뷰에_답글_초안_3종을_만들고_약속_표현이_있으면_다시_생성한다() throws Exception {
        when(llmClient.generateJson(any())).thenReturn(
                mapper.readTree("""
                        {"type":"COMPLAINT","sentiment":"NEGATIVE","keywords":["배달 지연"],"confidence":0.9}
                        """),
                mapper.readTree("""
                        {"polite":"배달이 늦어 죄송합니다. 다음 주문 때 쿠폰을 드리겠습니다.","friendly":"배달이 늦어 죄송해요.","concise":"배달 지연 죄송해요."}
                        """),
                mapper.readTree("""
                        {"polite":"배달이 늦어 불편을 드려 죄송합니다. 배달 과정을 다시 점검하겠습니다.","friendly":"배달이 늦어져 정말 죄송해요. 더 신경 쓸게요.","concise":"배달 지연 죄송해요. 개선할게요."}
                        """));
        ReviewResponse review = reviewService.createBatch(storeId, new ReviewBatchRequest(
                Platform.BAEMIN, List.of(new ReviewItem(2, "배달이 너무 늦었어요")))).get(0);

        ReviewResponse withDrafts = reviewService.generateReplies(review.id());

        assertThat(withDrafts.replies()).extracting(r -> r.tone())
                .containsExactly(ReplyTone.POLITE, ReplyTone.FRIENDLY, ReplyTone.CONCISE);
        assertThat(withDrafts.replies()).noneMatch(r -> r.content().contains("쿠폰"));
        ArgumentCaptor<LlmRequest> captor = ArgumentCaptor.forClass(LlmRequest.class);
        verify(llmClient, times(3)).generateJson(captor.capture());
        LlmRequest retry = captor.getAllValues().get(2);
        assertThat(retry.user()).contains("해요체").contains("배달 지연").contains("보상·할인 약속");

        // 다시 생성하면 복사하지 않은 초안은 새것으로 바뀐다 (개수 유지)
        when(llmClient.generateJson(any())).thenReturn(mapper.readTree("""
                {"polite":"배달이 늦어 죄송합니다.","friendly":"배달이 늦어 죄송해요!","concise":"배달 지연 죄송해요."}
                """));
        assertThat(reviewService.generateReplies(review.id()).replies()).hasSize(3);
    }

    @Test
    void 평점만_리뷰는_답글_초안_생성_대상이_아니다() {
        ReviewResponse review = reviewService.createBatch(storeId, new ReviewBatchRequest(
                Platform.BAEMIN, List.of(new ReviewItem(5, "")))).get(0);
        assertThatThrownBy(() -> reviewService.generateReplies(review.id()))
                .isInstanceOf(com.replyboss.common.ApiException.class);
    }

    private static final String DRAFTS = """
            {"polite":"치즈볼을 맛있게 드셔서 기쁩니다. 다음에도 정성껏 준비하겠습니다.","friendly":"치즈볼 맛있게 드셨다니 기뻐요. 또 들러주세요.","concise":"치즈볼 칭찬 감사드려요."}
            """;
    private static final String DRAFTS_2 = """
            {"polite":"치즈볼 칭찬에 힘이 납니다. 늘 같은 맛으로 준비하겠습니다.","friendly":"치즈볼이 마음에 드셨다니 다행이에요. 다음에도 기다릴게요.","concise":"치즈볼 좋게 봐주셔서 고마워요."}
            """;

    private ReviewResponse praiseWithDrafts() throws Exception {
        when(llmClient.generateJson(any())).thenReturn(
                mapper.readTree("""
                        {"type":"PRAISE","sentiment":"POSITIVE","keywords":["치즈볼"],"confidence":0.95}
                        """),
                mapper.readTree(DRAFTS));
        ReviewResponse review = reviewService.createBatch(storeId, new ReviewBatchRequest(
                Platform.BAEMIN, List.of(new ReviewItem(5, "치즈볼이 정말 맛있어요")))).get(0);
        return reviewService.generateReplies(review.id());
    }

    @Test
    void 초안만_있으면_작성_완료가_아니고_확정하면_최종_답글_하나만_남는다() throws Exception {
        ReviewResponse drafted = praiseWithDrafts();
        assertThat(drafted.replyStatus()).isEqualTo("DRAFT");
        assertThat(drafted.finalReplyId()).isNull();
        assertThat(drafted.completedAt()).isNull();

        Long friendly = drafted.replies().get(1).id();
        ReviewResponse done = reviewService.completeReply(drafted.id(), new CompleteReplyRequest(friendly, "  치즈볼 맛있게 드셨다니 정말 기뻐요.  "));
        assertThat(done.replyStatus()).isEqualTo("COMPLETED");
        assertThat(done.finalReplyId()).isEqualTo(friendly);
        assertThat(done.completedAt()).isNotNull();
        assertThat(done.replies()).filteredOn(r -> r.id().equals(friendly)).singleElement()
                .satisfies(r -> assertThat(r.editedContent()).isEqualTo("치즈볼 맛있게 드셨다니 정말 기뻐요."));

        // 새로고침(목록 다시 조회) 후에도 유지된다
        ReviewResponse listed = reviewService.list(storeId, null, null).stream().filter(r -> r.id().equals(drafted.id())).findFirst().orElseThrow();
        assertThat(listed.replyStatus()).isEqualTo("COMPLETED");
        assertThat(listed.finalReplyId()).isEqualTo(friendly);

        // 다른 답글로 바꾸면 최종 답글은 여전히 하나, 처음 완료 시각은 유지
        Long polite = drafted.replies().get(0).id();
        ReviewResponse switched = reviewService.completeReply(drafted.id(), new CompleteReplyRequest(polite, drafted.replies().get(0).content()));
        assertThat(switched.finalReplyId()).isEqualTo(polite);
        assertThat(switched.completedAt()).isEqualTo(done.completedAt());
        assertThat(switched.replies()).filteredOn(r -> r.selected()).extracting(r -> r.id()).containsExactly(polite);
        assertThat(switched.replies()).filteredOn(r -> r.id().equals(polite)).singleElement()
                .satisfies(r -> assertThat(r.editedContent()).isNull()); // 고치지 않았으면 수정본 없음
    }

    @Test
    void 다시_생성해도_최종_답글은_지우지_않고_나머지_초안만_바꾼다() throws Exception {
        ReviewResponse drafted = praiseWithDrafts();
        Long concise = drafted.replies().get(2).id();
        reviewService.completeReply(drafted.id(), new CompleteReplyRequest(concise, "치즈볼 칭찬 감사드려요!"));

        when(llmClient.generateJson(any())).thenReturn(mapper.readTree(DRAFTS_2));
        ReviewResponse regenerated = reviewService.generateReplies(drafted.id());

        assertThat(regenerated.replyStatus()).isEqualTo("COMPLETED");
        assertThat(regenerated.finalReplyId()).isEqualTo(concise);
        assertThat(regenerated.replies()).hasSize(4); // 최종 1 + 새 초안 3
        assertThat(regenerated.replies()).filteredOn(r -> r.id().equals(concise)).singleElement()
                .satisfies(r -> assertThat(r.editedContent()).isEqualTo("치즈볼 칭찬 감사드려요!"));
    }

    @Test
    void 다른_리뷰의_답글로는_확정할_수_없다() throws Exception {
        ReviewResponse a = praiseWithDrafts();
        ReviewResponse b = reviewService.createBatch(storeId, new ReviewBatchRequest(
                Platform.BAEMIN, List.of(new ReviewItem(5, "")))).get(0);
        assertThatThrownBy(() -> reviewService.completeReply(b.id(), new CompleteReplyRequest(a.replies().get(0).id(), "답글")))
                .isInstanceOf(com.replyboss.common.ApiException.class);
        // 별점만 리뷰의 템플릿 답글도 확정할 수 있다
        assertThat(reviewService.completeReply(b.id(), new CompleteReplyRequest(b.replies().get(0).id(), b.replies().get(0).content()))
                .replyStatus()).isEqualTo("COMPLETED");
    }

    @Test
    void 새_초안을_만들_때_매장_정보와_최근_최종_답글을_함께_보낸다() throws Exception {
        storeService.update(storeId, new StoreRequest("달빛카페", "카페", "주문 후 바로 굽습니다."));
        ReviewResponse first = praiseWithDrafts();
        reviewService.completeReply(first.id(), new CompleteReplyRequest(first.replies().get(0).id(), "치즈볼을 맛있게 드셔서 기쁩니다. 다음에도 정성껏 준비하겠습니다."));

        reset(llmClient);
        praiseWithDrafts();
        ArgumentCaptor<LlmRequest> captor = ArgumentCaptor.forClass(LlmRequest.class);
        verify(llmClient, times(2)).generateJson(captor.capture());
        String user = captor.getAllValues().get(1).user();
        assertThat(user).contains("[확인된 매장 정보] 주문 후 바로 굽습니다.")
                .contains("감정: POSITIVE")
                .contains("[최근 답글").contains("치즈볼을 맛있게 드셔서 기쁩니다.");
    }
}
