package com.replyboss.reply;

import com.fasterxml.jackson.databind.JsonNode;
import com.replyboss.ai.LlmClient;
import com.replyboss.ai.LlmException;
import com.replyboss.ai.LlmRequest;
import com.replyboss.ai.EmbeddingClient;
import com.replyboss.ai.OpenAiProperties;
import com.replyboss.ai.SimilarityProperties;
import com.replyboss.ai.Vectors;
import com.replyboss.ai.PromptTemplates;
import com.replyboss.review.ReviewType;
import com.replyboss.review.Sentiment;
import com.replyboss.store.ToneProfile;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import static com.replyboss.ai.Schemas.object;
import static com.replyboss.ai.Schemas.props;
import static com.replyboss.ai.Schemas.string;

/**
 * 기능 3. 맞춤형 답글 초안 3종(정중형·친근형·간결형) 생성.
 * 매장 말투와 톤별 문장 수, 이전 답글(중복 방지 2단)을 주입하고, 생성 후 안전 규칙(약속 금지·가림 표시 금지)과
 * 키워드 반영·문장 수, 이전 답글과의 임베딩 유사도(중복 방지 3단)를 코드로 다시 확인한다.
 * 규칙을 어긴 초안이 있으면 이유를 알려 주고 한 번 다시 생성한다.
 */
@Service
public class ReplyGenerationService {

    private static final Logger log = LoggerFactory.getLogger(ReplyGenerationService.class);

    static final String PROMPT = "reply_generate_v3";
    static final List<ReviewType> TARGET_TYPES = List.of(ReviewType.PRAISE, ReviewType.COMPLAINT, ReviewType.INQUIRY);

    private static final Map<String, Object> SCHEMA = object(props(
            "polite", string(),
            "friendly", string(),
            "concise", string()
    ));
    private static final Map<ReplyTone, String> FIELD = Map.of(
            ReplyTone.POLITE, "polite", ReplyTone.FRIENDLY, "friendly", ReplyTone.CONCISE, "concise");

    /** 사장님이 정하지 않은 보상 약속으로 볼 표현 */
    static final Pattern PROMISE = Pattern.compile("환불|할인|쿠폰|무료|보상|적립금|서비스로\\s*(드리|챙겨)|서비스\\s*(드릴|드리겠|챙겨)");
    /** 개인정보 가림 표시 */
    static final Pattern MASK = Pattern.compile("\\[(전화번호|이메일|주소|주문번호|번호)\\]");
    /** 문장 경계: 마침표·물음표·느낌표·물결·말줄임표·이모지 뒤의 공백, 또는 줄바꿈 */
    private static final Pattern SENTENCE_BREAK = Pattern.compile("(?<=[.!?~…\\p{So}\\uFE0F])\\s+|\\n+");
    private static final Pattern LETTER = Pattern.compile("[\\p{IsHangul}\\p{L}\\p{N}]");
    /** 문장 수를 이만큼 넘는 것까지는 허용 (문장 쪼개기 방식 차이) */
    private static final int LENGTH_TOLERANCE = 1;

    private final LlmClient llmClient;
    private final EmbeddingClient embeddingClient;
    private final PromptTemplates prompts;
    private final OpenAiProperties props;
    private final SimilarityProperties similarity;

    public ReplyGenerationService(LlmClient llmClient, EmbeddingClient embeddingClient, PromptTemplates prompts,
                                  OpenAiProperties props, SimilarityProperties similarity) {
        this.llmClient = llmClient;
        this.embeddingClient = embeddingClient;
        this.prompts = prompts;
        this.props = props;
        this.similarity = similarity;
    }

    /** 이전에 쓴 최종 답글 (embedding 은 없을 수 있음) */
    public record PastReply(String text, float[] embedding) {
    }

    /**
     * @param storeInfo   사장님이 적은 매장 소개·운영 방식 (없으면 null). 답글은 여기 적힌 내용만 운영 방식으로 언급한다.
     * @param pastReplies 피해야 할 이전 답글 (같은 묶음 리뷰의 답글 → 최근 최종 답글 순)
     */
    public record Context(String storeName, String category, String storeInfo, ToneProfile tone,
                          int rating, ReviewType type, Sentiment sentiment, List<String> keywords,
                          String maskedContent, List<PastReply> pastReplies) {
    }

    /** 초안 하나: 문장, 임베딩(못 받았으면 null), 이전 답글과의 최대 유사도(비교 못 했으면 null) */
    public record Draft(String text, float[] embedding, Double maxSimilarity) {
    }

    /** 톤별 초안과 다시 생성한 횟수 */
    public record Result(Map<ReplyTone, Draft> drafts, int regenerations) {
    }

    private static final int RECENT_REPLY_MAX_LENGTH = 200;
    /** 프롬프트에 보여줄 이전 답글 수 (2단) */
    static final int PROMPT_PAST_REPLY_COUNT = 8;

    /**
     * 톤별 초안을 만든다. 규칙 위반(약속·가림 표시·키워드·문장 수)이나
     * 이전 답글과의 유사도(3단, 기준 이상)가 있으면 이유를 알려 주고 최대 maxRegenerations 번 다시 만든다.
     * 여러 번 만든 경우 톤마다 문제가 가장 적고 덜 비슷한 초안을 고른다. 안전 규칙을 끝까지 어긴 초안은 뺀다.
     */
    public Result generate(Context ctx) {
        String userMessage = userMessage(ctx);
        List<float[]> pastVectors = ctx.pastReplies().stream().map(PastReply::embedding).filter(v -> v != null).toList();
        Map<ReplyTone, Draft> best = new EnumMap<>(ReplyTone.class);
        Map<ReplyTone, Double> bestScore = new EnumMap<>(ReplyTone.class);
        String feedback = "";
        int attempt = 0;
        int maxAttempts = 1 + Math.max(0, similarity.maxRegenerations());
        while (true) {
            Map<ReplyTone, String> texts = call(userMessage + feedback);
            Map<ReplyTone, Draft> drafts = withSimilarity(texts, pastVectors);
            List<String> problems = new ArrayList<>();
            drafts.forEach((tone, draft) -> {
                List<String> own = problemsOf(tone, draft.text(), ctx);
                if (draft.maxSimilarity() != null && draft.maxSimilarity() >= similarity.replyThreshold()) {
                    own.add(FIELD.get(tone) + ": 이전 답글과 너무 비슷함 (유사도 "
                            + String.format(java.util.Locale.ROOT, "%.2f", draft.maxSimilarity())
                            + "). 시작 문장, 짚는 내용, 마무리 표현을 바꿀 것");
                }
                problems.addAll(own);
                if (isSafe(draft.text())) {
                    double score = own.size() * 10 + (draft.maxSimilarity() == null ? 0 : draft.maxSimilarity());
                    if (!bestScore.containsKey(tone) || score < bestScore.get(tone)) {
                        bestScore.put(tone, score);
                        best.put(tone, draft);
                    }
                }
            });
            attempt++;
            if (problems.isEmpty() || attempt >= maxAttempts) {
                if (!problems.isEmpty()) {
                    log.info("답글 초안 {}회 생성 후에도 남은 문제: {}", attempt, problems);
                }
                break;
            }
            log.info("답글 초안 다시 생성 ({}회째): {}", attempt, problems);
            feedback = "\n\n[이전 초안의 문제 — 고쳐서 다시 작성]\n- " + String.join("\n- ", problems);
        }
        if (best.isEmpty()) {
            throw new LlmException("안전 규칙을 지키는 답글 초안을 만들지 못했습니다", null, "LLM_INVALID");
        }
        return new Result(best, attempt - 1);
    }

    static boolean isSafe(String text) {
        return !PROMISE.matcher(text).find() && !MASK.matcher(text).find();
    }

    /** 3단: 초안을 임베딩해 이전 답글과의 최대 유사도를 붙인다. 임베딩 실패 시 비교 없이 진행 */
    private Map<ReplyTone, Draft> withSimilarity(Map<ReplyTone, String> texts, List<float[]> pastVectors) {
        List<ReplyTone> tones = new ArrayList<>(texts.keySet());
        List<float[]> vectors = null;
        try {
            vectors = embeddingClient.embed(tones.stream().map(texts::get).toList());
            if (vectors == null || vectors.size() != tones.size() || vectors.contains(null)) {
                vectors = null;
            }
        } catch (RuntimeException e) {
            log.warn("답글 초안 임베딩 실패, 유사도 비교 없이 진행: {}", e.getMessage());
        }
        Map<ReplyTone, Draft> out = new EnumMap<>(ReplyTone.class);
        for (int i = 0; i < tones.size(); i++) {
            float[] v = vectors == null ? null : vectors.get(i);
            Double sim = v == null || pastVectors.isEmpty() ? null : Vectors.maxCosine(v, pastVectors);
            out.put(tones.get(i), new Draft(texts.get(tones.get(i)), v, sim));
        }
        return out;
    }

    private Map<ReplyTone, String> call(String userMessage) {
        JsonNode json = llmClient.generateJson(new LlmRequest(
                props.generateModel(),
                prompts.render(PROMPT, Map.of()),
                userMessage,
                "reply_drafts",
                SCHEMA,
                3000
        ));
        Map<ReplyTone, String> drafts = new EnumMap<>(ReplyTone.class);
        FIELD.forEach((tone, field) -> {
            String text = json.path(field).asText("").strip();
            if (!text.isEmpty()) {
                drafts.put(tone, text.length() > 2000 ? text.substring(0, 2000) : text);
            }
        });
        if (drafts.isEmpty()) {
            throw new LlmException("답글 초안이 비어 있습니다", null, "LLM_INVALID");
        }
        return drafts;
    }

    /** 규칙 위반 목록 (다시 생성할 때 모델에 알려준다) */
    static List<String> problems(Map<ReplyTone, String> drafts, Context ctx) {
        List<String> problems = new ArrayList<>();
        drafts.forEach((tone, text) -> problems.addAll(problemsOf(tone, text, ctx)));
        return problems;
    }

    static List<String> problemsOf(ReplyTone tone, String text, Context ctx) {
        List<String> problems = new ArrayList<>();
        String name = FIELD.get(tone);
        if (PROMISE.matcher(text).find()) {
            problems.add(name + ": 정하지 않은 보상·할인 약속 표현이 있음");
        }
        if (MASK.matcher(text).find()) {
            problems.add(name + ": 개인정보 가림 표시를 그대로 씀");
        }
        if (!ctx.keywords().isEmpty() && !mentionsKeyword(text, ctx.keywords())) {
            problems.add(name + ": 리뷰 키워드(" + String.join(", ", ctx.keywords()) + ")를 언급하지 않음");
        }
        int[] range = sentenceRange(ctx.tone(), tone);
        int count = countSentences(text);
        if (count < range[0] || count > range[1] + LENGTH_TOLERANCE) {
            problems.add(name + ": " + count + "문장으로 작성됨 (" + range[0] + "~" + range[1] + "문장으로 맞출 것)");
        }
        return problems;
    }

    /** "배달 지연" 같은 키워드는 낱말 하나만 나와도 언급한 것으로 본다 ("배달이 늦어" 등) */
    static boolean mentionsKeyword(String text, List<String> keywords) {
        for (String k : keywords) {
            for (String token : k.split("\\s+")) {
                if (token.length() >= 2 && text.contains(token)) {
                    return true;
                }
            }
        }
        return false;
    }

    /** 톤별 목표 문장 수 [최소, 최대]. 간결형은 항상 1~2문장, 나머지는 매장 말투의 문장 길이 */
    static int[] sentenceRange(ToneProfile tone, ReplyTone replyTone) {
        if (replyTone == ReplyTone.CONCISE) {
            return new int[]{1, 2};
        }
        return switch (tone.length()) {
            case "1~2문장" -> new int[]{1, 2};
            case "3~4문장" -> new int[]{3, 4};
            default -> new int[]{2, 3};
        };
    }

    /** 문장 수. 이모지만 있는 조각처럼 글자가 없는 조각은 세지 않는다 */
    static int countSentences(String text) {
        int count = 0;
        for (String part : SENTENCE_BREAK.split(text.strip())) {
            if (LETTER.matcher(part).find()) {
                count++;
            }
        }
        return count;
    }

    static String userMessage(Context ctx) {
        ToneProfile t = ctx.tone();
        StringBuilder sb = new StringBuilder();
        sb.append("[매장] ").append(ctx.storeName()).append(" (").append(ctx.category()).append(")\n");
        sb.append("[확인된 매장 정보] ").append(isBlank(ctx.storeInfo()) ? "없음" : ctx.storeInfo().strip()).append('\n');
        sb.append("[매장 말투]\n");
        sb.append("- 높임말: ").append(t.formality()).append('\n');
        sb.append("- 이모지: ").append(t.emojiLevel());
        if (t.usesEmoji()) {
            sb.append(" (").append(String.join(" ", t.emojiExamples())).append(')');
        }
        sb.append('\n');
        sb.append("- 문장 길이: ").append(t.length()).append('\n');
        sb.append("- 자주 쓰는 표현: ").append(t.phrases().isEmpty() ? "없음" : String.join(", ", t.phrases())).append('\n');
        sb.append("- 마무리 인사: ").append(t.closing().isEmpty() ? "없음" : t.closing()).append('\n');
        sb.append("[작성 분량]\n");
        for (ReplyTone tone : List.of(ReplyTone.POLITE, ReplyTone.FRIENDLY, ReplyTone.CONCISE)) {
            int[] range = sentenceRange(t, tone);
            sb.append("- ").append(FIELD.get(tone)).append(": ").append(range[0]).append('~').append(range[1]).append("문장\n");
        }
        sb.append("[리뷰]\n");
        sb.append("- 별점: ").append(ctx.rating()).append('\n');
        sb.append("- 유형: ").append(ctx.type().name()).append('\n');
        sb.append("- 감정: ").append(ctx.sentiment() == null ? "알 수 없음" : ctx.sentiment().name()).append('\n');
        sb.append("- 키워드: ").append(ctx.keywords().isEmpty() ? "없음" : String.join(", ", ctx.keywords())).append('\n');
        sb.append("- 본문: ").append(ctx.maskedContent());
        if (!ctx.pastReplies().isEmpty()) {
            sb.append("\n[최근 답글 - 시작·마무리 표현 반복 금지]");
            for (String r : ctx.pastReplies().stream().limit(PROMPT_PAST_REPLY_COUNT).map(PastReply::text).toList()) {
                String one = r.strip().replaceAll("\\s+", " ");
                sb.append("\n- ").append(one.length() > RECENT_REPLY_MAX_LENGTH ? one.substring(0, RECENT_REPLY_MAX_LENGTH) + "…" : one);
            }
        }
        return sb.toString();
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
