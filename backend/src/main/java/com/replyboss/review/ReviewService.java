package com.replyboss.review;

import com.replyboss.ai.LlmException;
import com.replyboss.common.ApiException;
import com.replyboss.common.JsonText;
import com.replyboss.masking.MaskingService;
import com.replyboss.reply.RatingOnlyReplyService;
import com.replyboss.reply.ReplyGenerationService;
import com.replyboss.reply.ReplyTone;
import com.replyboss.reply.Reply;
import com.replyboss.reply.ReplyRepository;
import com.replyboss.review.ReviewDtos.CompleteReplyRequest;
import com.replyboss.review.ReviewDtos.DuplicateCheckItem;
import com.replyboss.review.ReviewDtos.DuplicateCheckRequest;
import com.replyboss.review.ReviewDtos.ReviewBatchRequest;
import com.replyboss.review.ReviewDtos.ReviewItem;
import com.replyboss.review.ReviewDtos.ReviewResponse;
import com.replyboss.store.Store;
import com.replyboss.store.StoreService;
import com.replyboss.store.ToneProfile;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 리뷰 입력 흐름: 마스킹 → 본문 없으면 규칙 분기(템플릿 답글) → 본문 있으면 LLM 분류.
 *
 * LLM 호출이 끼어 있으므로 일괄 처리 전체를 하나의 트랜잭션으로 묶지 않는다.
 * 리뷰를 먼저 저장하고, 분류에 실패한 리뷰는 FAILED 로 남겨 화면에서 다시 시도하게 한다.
 */
@Service
public class ReviewService {

    private static final Logger log = LoggerFactory.getLogger(ReviewService.class);

    private final ReviewRepository reviewRepository;
    private final ReplyRepository replyRepository;
    private final StoreService storeService;
    private final MaskingService maskingService;
    private final ClassificationService classificationService;
    private final RatingOnlyReplyService ratingOnlyReplyService;
    private final ReplyGenerationService replyGenerationService;

    public ReviewService(ReviewRepository reviewRepository,
                         ReplyRepository replyRepository,
                         StoreService storeService,
                         MaskingService maskingService,
                         ClassificationService classificationService,
                         RatingOnlyReplyService ratingOnlyReplyService,
                         ReplyGenerationService replyGenerationService) {
        this.reviewRepository = reviewRepository;
        this.replyRepository = replyRepository;
        this.storeService = storeService;
        this.maskingService = maskingService;
        this.classificationService = classificationService;
        this.ratingOnlyReplyService = ratingOnlyReplyService;
        this.replyGenerationService = replyGenerationService;
    }

    public List<ReviewResponse> createBatch(Long storeId, ReviewBatchRequest request) {
        Store store = storeService.get(storeId);
        ToneProfile tone = JsonText.read(store.getToneProfile(), ToneProfile.class);

        List<ReviewResponse> results = new ArrayList<>();
        for (ReviewItem item : request.reviews()) {
            results.add(createOne(store, tone, request.platform(), item));
        }
        return results;
    }

    private ReviewResponse createOne(Store store, ToneProfile tone, Platform platform, ReviewItem item) {
        String masked = maskingService.mask(item.content());
        Review newReview = new Review(store, platform, item.rating(), masked);
        newReview.recordWrittenOn(item.writtenAt());
        Review review = reviewRepository.save(newReview);

        if (!review.hasContent()) {
            review.markRatingOnly();
            reviewRepository.save(review);
            Reply reply = ratingOnlyReplyService.createReply(review, store.getId(), tone);
            return ReviewResponse.from(review, List.of(reply));
        }

        classifyInto(review);
        return ReviewResponse.from(review, List.of());
    }

    /** 분류해서 저장한다. 실패하면 FAILED 로 저장하고 예외는 삼킨다. */
    private void classifyInto(Review review) {
        try {
            review.applyClassification(classificationService.classify(review.getRating(), review.getMaskedContent()));
        } catch (LlmException e) {
            log.warn("리뷰 {} 분류 실패: {}", review.getId(), e.getMessage());
            review.markFailed(e.getReason());
        } catch (ApiException e) {
            review.markFailed(e.getCode());
        }
        reviewRepository.save(review);
    }

    /** 실패한(또는 다시 분류하고 싶은) 리뷰를 다시 분류한다. 실패하면 오류를 그대로 돌려준다. */
    public ReviewResponse reclassify(Long reviewId) {
        Review review = reviewRepository.findById(reviewId).orElseThrow(() -> ApiException.notFound("리뷰"));
        if (!review.hasContent()) {
            throw ApiException.badRequest("RATING_ONLY", "본문이 없는 리뷰는 별점 규칙으로 분류됩니다.");
        }
        try {
            review.applyClassification(classificationService.classify(review.getRating(), review.getMaskedContent()));
        } catch (LlmException e) {
            review.markFailed(e.getReason());
            reviewRepository.save(review);
            throw e;
        }
        reviewRepository.save(review);
        return ReviewResponse.from(review, replyRepository.findByReview_IdInOrderByIdAsc(List.of(reviewId)));
    }

    /**
     * 일괄 등록 전에 이미 저장된 리뷰와 겹치는 항목을 찾는다.
     * 저장할 때와 같은 마스킹을 거친 본문으로 비교하며, 본문이 없는(별점만) 항목은 구별할 수 없으므로 중복으로 보지 않는다.
     */
    @Transactional(readOnly = true)
    public List<Integer> findDuplicates(Long storeId, DuplicateCheckRequest request) {
        storeService.get(storeId);
        List<Integer> duplicates = new ArrayList<>();
        List<DuplicateCheckItem> items = request.items();
        for (int i = 0; i < items.size(); i++) {
            String masked = maskingService.mask(items.get(i).content());
            if (!masked.isBlank()
                    && reviewRepository.existsByStore_IdAndPlatformAndMaskedContent(storeId, items.get(i).platform(), masked)) {
                duplicates.add(i);
            }
        }
        return duplicates;
    }

    private static final List<ReplyTone> DRAFT_TONES = List.of(ReplyTone.POLITE, ReplyTone.FRIENDLY, ReplyTone.CONCISE);
    /** 새 초안에 참고로 넘기는 최근 최종 답글 수 */
    private static final int RECENT_REPLY_COUNT = 5;

    /**
     * 기능 3. 칭찬·불만·문의 리뷰에 답글 초안 3종을 만든다. 다시 부르면 이전 초안을 새 초안으로 바꾸되,
     * 최종 확정한 답글은 그대로 둔다. LLM 호출이 끼어 있어 하나의 트랜잭션으로 묶지 않는다.
     */
    public ReviewResponse generateReplies(Long reviewId) {
        Review review = reviewRepository.findById(reviewId).orElseThrow(() -> ApiException.notFound("리뷰"));
        if (review.getStatus() != ReviewStatus.CLASSIFIED || !List.of(ReviewType.PRAISE, ReviewType.COMPLAINT, ReviewType.INQUIRY)
                .contains(review.getType())) {
            throw ApiException.badRequest("NOT_DRAFT_TARGET", "칭찬·불만·문의로 분류된 리뷰만 답글 초안을 생성합니다.");
        }
        Store store = storeService.get(review.getStore().getId());
        ToneProfile tone = JsonText.read(store.getToneProfile(), ToneProfile.class);
        if (tone == null) {
            throw ApiException.badRequest("NO_TONE", "매장 설정에서 답글 스타일을 먼저 저장하십시오.");
        }

        List<String> recent = replyRepository.findRecentFinals(store.getId(), reviewId, PageRequest.of(0, RECENT_REPLY_COUNT))
                .stream().map(Reply::getText).toList();
        Map<ReplyTone, String> drafts = replyGenerationService.generate(new ReplyGenerationService.Context(
                store.getName(), store.getCategory(), store.getInfo(), tone,
                review.getRating(), review.getType(), review.getSentiment(), review.getKeywords(),
                review.getMaskedContent(), recent));

        // 생성하는 동안 최종 답글이 바뀌었을 수 있으므로 다시 읽는다. 최종 확정한 답글은 지우지 않는다.
        Long finalId = reviewRepository.findById(reviewId).map(Review::getFinalReplyId).orElse(null);
        replyRepository.deleteAll(replyRepository.findByReview_IdAndToneIn(reviewId, DRAFT_TONES).stream()
                .filter(r -> !r.getId().equals(finalId))
                .toList());
        for (ReplyTone t : DRAFT_TONES) {
            if (drafts.containsKey(t)) {
                replyRepository.save(new Reply(review, null, t, drafts.get(t)));
            }
        }
        Review fresh = reviewRepository.findById(reviewId).orElse(review);
        return ReviewResponse.from(fresh, replyRepository.findByReview_IdInOrderByIdAsc(List.of(reviewId)));
    }

    /**
     * 답글을 최종 확정한다 (작성 완료). 확정한 답글을 고쳐 다시 저장할 때도 쓴다.
     * 리뷰 하나에 최종 답글은 하나뿐이라, 다른 답글로 바꾸면 이전 답글은 확정에서 빠진다.
     * 외부 플랫폼에 게시하지 않는다. 사장님이 붙여넣을 답글을 확정해 두는 기능이다.
     */
    @Transactional
    public ReviewResponse completeReply(Long reviewId, CompleteReplyRequest request) {
        Review review = reviewRepository.findById(reviewId).orElseThrow(() -> ApiException.notFound("리뷰"));
        Reply reply = replyRepository.findById(request.replyId()).orElseThrow(() -> ApiException.notFound("답글"));
        if (!reply.getReview().getId().equals(reviewId)) {
            throw ApiException.badRequest("REPLY_MISMATCH", "이 리뷰의 답글이 아닙니다.");
        }
        Long previous = review.getFinalReplyId();
        if (previous != null && !previous.equals(reply.getId())) {
            replyRepository.findById(previous).ifPresent(Reply::unmarkFinal);
        }
        reply.markFinal(request.content());
        review.completeWith(reply.getId(), LocalDateTime.now().truncatedTo(ChronoUnit.SECONDS));
        return ReviewResponse.from(review, replyRepository.findByReview_IdInOrderByIdAsc(List.of(reviewId)));
    }

    /** 날짜(없으면 전체)와 유형으로 거른 리뷰 목록. 최신순. */
    @Transactional(readOnly = true)
    public List<ReviewResponse> list(Long storeId, LocalDate date, ReviewType type) {
        storeService.get(storeId);
        List<Review> reviews = date == null
                ? reviewRepository.findByStore_IdOrderByIdDesc(storeId)
                : reviewRepository.findByStore_IdAndCreatedAtBetweenOrderByIdDesc(
                        storeId, date.atStartOfDay(), date.plusDays(1).atStartOfDay().minusNanos(1));
        if (type != null) {
            reviews = reviews.stream().filter(r -> r.getType() == type).toList();
        }
        if (reviews.isEmpty()) {
            return List.of();
        }

        Map<Long, List<Reply>> repliesByReview = replyRepository
                .findByReview_IdInOrderByIdAsc(reviews.stream().map(Review::getId).toList())
                .stream()
                .collect(Collectors.groupingBy(r -> r.getReview().getId()));

        return reviews.stream()
                .map(r -> ReviewResponse.from(r, repliesByReview.getOrDefault(r.getId(), List.of())))
                .toList();
    }
}
