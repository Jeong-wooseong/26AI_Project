package com.replyboss.review;

import com.replyboss.reply.Reply;
import com.replyboss.reply.ReplyTone;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public final class ReviewDtos {

    private ReviewDtos() {
    }

    public record ReviewItem(
            @NotNull(message = "별점을 선택하십시오.")
            @Min(value = 1, message = "별점은 1~5점입니다.")
            @Max(value = 5, message = "별점은 1~5점입니다.")
            Integer rating,
            @Size(max = 2000, message = "리뷰 내용은 2000자 이내여야 합니다.")
            String content,
            /** 고객 작성일 (선택). 일괄 가져오기에서만 채워진다. */
            @PastOrPresent(message = "작성일은 오늘 이전이어야 합니다.")
            LocalDate writtenAt
    ) {
        /** 작성일 없이 만드는 기존 형태 */
        public ReviewItem(Integer rating, String content) {
            this(rating, content, null);
        }
    }

    public record ReviewBatchRequest(
            @NotNull(message = "리뷰 출처를 선택하십시오.")
            Platform platform,
            @NotEmpty(message = "리뷰를 1건 이상 입력하십시오.")
            @Size(max = 30, message = "한 번에 최대 30건까지 등록할 수 있습니다.")
            List<@Valid ReviewItem> reviews
    ) {
    }

    public record ReplyResponse(
            Long id,
            ReplyTone tone,
            String content,
            String editedContent,
            boolean selected
    ) {
        public static ReplyResponse from(Reply reply) {
            return new ReplyResponse(reply.getId(), reply.getTone(), reply.getContent(),
                    reply.getEditedContent(), reply.isSelected());
        }
    }

    public record ReviewResponse(
            Long id,
            Platform platform,
            int rating,
            String maskedContent,
            ReviewType type,
            Sentiment sentiment,
            List<String> keywords,
            Double confidence,
            ReviewStatus status,
            String failureCode,
            LocalDateTime createdAt,
            LocalDate writtenAt,
            List<ReplyResponse> replies
    ) {
        public static ReviewResponse from(Review review, List<Reply> replies) {
            return new ReviewResponse(
                    review.getId(),
                    review.getPlatform(),
                    review.getRating(),
                    review.getMaskedContent(),
                    review.getType(),
                    review.getSentiment(),
                    review.getKeywords(),
                    review.getConfidence(),
                    review.getStatus(),
                    review.getFailureCode(),
                    review.getCreatedAt(),
                    review.getWrittenOn(),
                    replies.stream().map(ReplyResponse::from).toList()
            );
        }
    }

    public record SelectReplyRequest(
            @Size(max = 2000, message = "답글은 2000자 이내여야 합니다.")
            String editedContent
    ) {
    }

    /** 일괄 등록 전 중복 확인: 같은 매장·출처에 같은 (마스킹된) 본문이 이미 있는지 */
    public record DuplicateCheckRequest(
            @NotNull(message = "확인할 리뷰가 없습니다.")
            @Size(max = 300, message = "한 번에 최대 300건까지 확인할 수 있습니다.")
            List<@Valid DuplicateCheckItem> items
    ) {
    }

    public record DuplicateCheckItem(
            @NotNull(message = "리뷰 출처를 선택하십시오.") Platform platform,
            @Size(max = 2000, message = "리뷰 내용은 2000자 이내여야 합니다.") String content
    ) {
    }

    /** 이미 등록된 리뷰와 같은 항목의 순번(0부터) */
    public record DuplicateCheckResponse(List<Integer> duplicateIndexes) {
    }

    /** 정확도 측정용: 저장하지 않고 분류만 한다. */
    public record EvalClassifyRequest(
            @NotNull @Min(1) @Max(5) Integer rating,
            String content
    ) {
    }

    public record EvalClassifyResponse(
            String maskedContent,
            ReviewType type,
            Sentiment sentiment,
            List<String> keywords,
            double confidence,
            boolean ruleBased,
            long latencyMs
    ) {
    }
}
