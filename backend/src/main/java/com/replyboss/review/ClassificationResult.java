package com.replyboss.review;

import java.util.List;

public record ClassificationResult(
        ReviewType type,
        Sentiment sentiment,
        List<String> keywords,
        double confidence
) {
}
