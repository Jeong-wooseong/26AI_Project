package com.replyboss.review;

import com.fasterxml.jackson.databind.JsonNode;
import com.replyboss.ai.LlmClient;
import com.replyboss.ai.LlmException;
import com.replyboss.ai.LlmRequest;
import com.replyboss.ai.OpenAiProperties;
import com.replyboss.ai.PromptTemplates;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

import static com.replyboss.ai.Schemas.arrayOf;
import static com.replyboss.ai.Schemas.number;
import static com.replyboss.ai.Schemas.object;
import static com.replyboss.ai.Schemas.props;
import static com.replyboss.ai.Schemas.string;
import static com.replyboss.ai.Schemas.stringEnum;

/**
 * 기능 1. 본문이 있는 리뷰를 LLM 으로 분류한다 (유형·감정·키워드).
 * 본문이 없는 리뷰는 여기로 오지 않는다 (ReviewService 에서 규칙으로 처리).
 */
@Service
public class ClassificationService {

    static final String PROMPT = "classify_v1";
    private static final int MAX_KEYWORDS = 3;
    private static final int MAX_KEYWORD_LENGTH = 20;

    private static final Map<String, Object> SCHEMA = object(props(
            "type", stringEnum(ReviewType.LLM_CHOICES),
            "sentiment", stringEnum(Sentiment.NAMES),
            "keywords", arrayOf(string()),
            "confidence", number()
    ));

    private final LlmClient llmClient;
    private final PromptTemplates prompts;
    private final OpenAiProperties props;

    public ClassificationService(LlmClient llmClient, PromptTemplates prompts, OpenAiProperties props) {
        this.llmClient = llmClient;
        this.prompts = prompts;
        this.props = props;
    }

    public ClassificationResult classify(int rating, String maskedContent) {
        JsonNode json = llmClient.generateJson(new LlmRequest(
                props.classifyModel(),
                prompts.render(PROMPT, Map.of()),
                "별점: " + rating + "\n본문: " + maskedContent,
                "review_classification",
                SCHEMA,
                2000,
                blankToNull(props.classifyReasoningEffort())
        ));
        return parse(json);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    /** 구조화 출력이어도 값 범위는 코드에서 한 번 더 확인한다. */
    static ClassificationResult parse(JsonNode json) {
        ReviewType type = parseEnum(ReviewType.class, json.path("type").asText(""));
        if (type == null || type == ReviewType.RATING_ONLY) {
            throw new LlmException("알 수 없는 리뷰 유형: " + json.path("type").asText(), null, "LLM_INVALID");
        }
        Sentiment sentiment = parseEnum(Sentiment.class, json.path("sentiment").asText(""));
        if (sentiment == null) {
            throw new LlmException("알 수 없는 감정 값: " + json.path("sentiment").asText(), null, "LLM_INVALID");
        }

        Set<String> keywords = new LinkedHashSet<>();
        for (JsonNode node : json.path("keywords")) {
            String k = node.asText("").strip();
            if (k.isEmpty() || k.contains("[") || k.contains("]") || k.length() > MAX_KEYWORD_LENGTH) {
                continue;
            }
            keywords.add(k);
            if (keywords.size() == MAX_KEYWORDS) {
                break;
            }
        }

        double confidence = json.path("confidence").asDouble(0.5);
        confidence = Math.max(0.0, Math.min(1.0, confidence));

        return new ClassificationResult(type, sentiment, new ArrayList<>(keywords), confidence);
    }

    private static <E extends Enum<E>> E parseEnum(Class<E> type, String value) {
        try {
            return Enum.valueOf(type, value.strip().toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
