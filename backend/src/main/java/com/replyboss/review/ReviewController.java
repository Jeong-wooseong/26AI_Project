package com.replyboss.review;

import com.replyboss.review.ReviewDtos.ReviewBatchRequest;
import com.replyboss.review.ReviewDtos.ReviewResponse;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
public class ReviewController {

    private final ReviewService reviewService;

    public ReviewController(ReviewService reviewService) {
        this.reviewService = reviewService;
    }

    /** 리뷰 일괄 입력 → 마스킹·분류 결과. 분류에 실패한 리뷰는 status=FAILED 로 함께 돌아온다. */
    @PostMapping("/api/stores/{storeId}/reviews")
    @ResponseStatus(HttpStatus.CREATED)
    public List<ReviewResponse> create(@PathVariable Long storeId, @Valid @RequestBody ReviewBatchRequest request) {
        return reviewService.createBatch(storeId, request);
    }

    @GetMapping("/api/stores/{storeId}/reviews")
    public List<ReviewResponse> list(@PathVariable Long storeId,
                                     @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
                                     @RequestParam(required = false) ReviewType type) {
        return reviewService.list(storeId, date, type);
    }

    /** 분류 다시 시도 */
    @PostMapping("/api/reviews/{reviewId}/classify")
    public ReviewResponse reclassify(@PathVariable Long reviewId) {
        return reviewService.reclassify(reviewId);
    }
}
