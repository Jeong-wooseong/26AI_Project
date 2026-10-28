package com.replyboss.review;

import com.replyboss.reply.Reply;
import com.replyboss.reply.ReplyTone;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;
import java.util.List;

public final class ReviewDtos {

    private ReviewDtos() {
    }

    public record ReviewItem(
            @NotNull(message = "별점을 선택해주세요.")
            @Min(value = 1, message = "별점은 1~5점이에요.")
            @Max(value = 5, message = "별점은 1~5점이에요.")
            Integer rating,
            @Size(max = 2000, message = "리뷰 본문은 2000자 이내로 입력해주세요.")
            String content
    ) {
    }

    public record ReviewBatchRequest(
            @NotNull(message = "플랫폼을 선택해주세요.")
            Platform platform,
            @NotEmpty(message = "리뷰를 1개 이상 입력해주세요.")
            @Size(max = 30, message = "한 번에 30개까지 입력할 수 있어요.")
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
                    replies.stream().map(ReplyResponse::from).toList()
            );
        }
    }

    public record SelectReplyRequest(
            @Size(max = 2000, message = "답글은 2000자 이내로 입력해주세요.")
            String editedContent
    ) {
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
