package com.replyboss.review;

import java.util.Arrays;
import java.util.List;

public enum Sentiment {
    POSITIVE,
    NEUTRAL,
    NEGATIVE;

    public static final List<String> NAMES = Arrays.stream(values()).map(Enum::name).toList();

    public static Sentiment fromRating(int rating) {
        if (rating >= 4) {
            return POSITIVE;
        }
        return rating == 3 ? NEUTRAL : NEGATIVE;
    }
}
