package com.replyboss.reply;

import com.replyboss.review.Sentiment;

/**
 * 별점과 본문 감정이 반대인 경우. 별점은 4~5점 높음, 1~2점 낮음, 3점은 중립으로 보고 비교하지 않는다.
 * 본문 감정이 중립이거나 알 수 없으면 불일치로 보지 않는다 (어느 한쪽을 틀렸다고 단정하지 않기 위해).
 */
public enum RatingMismatch {
    HIGH_RATING_NEGATIVE, // 별점은 높은데 본문은 부정적
    LOW_RATING_POSITIVE;  // 별점은 낮은데 본문은 긍정적

    public static RatingMismatch of(int rating, Sentiment content) {
        if (content == null) {
            return null;
        }
        if (rating >= 4 && content == Sentiment.NEGATIVE) {
            return HIGH_RATING_NEGATIVE;
        }
        if (rating <= 2 && content == Sentiment.POSITIVE) {
            return LOW_RATING_POSITIVE;
        }
        return null;
    }

    String description(int rating) {
        return this == HIGH_RATING_NEGATIVE
                ? "별점은 높은데(" + rating + "점) 본문은 부정적"
                : "별점은 낮은데(" + rating + "점) 본문은 긍정적";
    }
}
