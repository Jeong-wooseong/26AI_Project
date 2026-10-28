package com.replyboss.review;

import com.replyboss.ai.LlmException;
import com.replyboss.common.ApiException;
import com.replyboss.common.JsonText;
import com.replyboss.masking.MaskingService;
import com.replyboss.reply.RatingOnlyReplyService;
import com.replyboss.reply.Reply;
import com.replyboss.reply.ReplyRepository;
import com.replyboss.review.ReviewDtos.ReviewBatchRequest;
import com.replyboss.review.ReviewDtos.ReviewItem;
import com.replyboss.review.ReviewDtos.ReviewResponse;
import com.replyboss.store.Store;
import com.replyboss.store.StoreService;
import com.replyboss.store.ToneProfile;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
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

    public ReviewService(ReviewRepository reviewRepository,
                         ReplyRepository replyRepository,
                         StoreService storeService,
                         MaskingService maskingService,
                         ClassificationService classificationService,
                         RatingOnlyReplyService ratingOnlyReplyService) {
        this.reviewRepository = reviewRepository;
        this.replyRepository = replyRepository;
        this.storeService = storeService;
        this.maskingService = maskingService;
        this.classificationService = classificationService;
        this.ratingOnlyReplyService = ratingOnlyReplyService;
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
        Review review = reviewRepository.save(new Review(store, platform, item.rating(), masked));

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
            review.markFailed("LLM_FAILED");
        } catch (ApiException e) {
            review.markFailed(e.getCode());
        }
        reviewRepository.save(review);
    }

    /** 실패한(또는 다시 분류하고 싶은) 리뷰를 다시 분류한다. 실패하면 오류를 그대로 돌려준다. */
    public ReviewResponse reclassify(Long reviewId) {
        Review review = reviewRepository.findById(reviewId).orElseThrow(() -> ApiException.notFound("리뷰"));
        if (!review.hasContent()) {
            throw ApiException.badRequest("RATING_ONLY", "본문이 없는 리뷰는 별점 규칙으로 분류돼요.");
        }
        try {
            review.applyClassification(classificationService.classify(review.getRating(), review.getMaskedContent()));
        } catch (LlmException e) {
            review.markFailed("LLM_FAILED");
            reviewRepository.save(review);
            throw e;
        }
        reviewRepository.save(review);
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
