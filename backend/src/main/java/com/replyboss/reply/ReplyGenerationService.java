package com.replyboss.reply;

import com.fasterxml.jackson.databind.JsonNode;
import com.replyboss.ai.LlmClient;
import com.replyboss.ai.LlmException;
import com.replyboss.ai.LlmRequest;
import com.replyboss.ai.OpenAiProperties;
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
 * 매장 말투와 톤별 문장 수를 주입하고, 생성 후 안전 규칙(약속 금지·가림 표시 금지)과 키워드 반영·문장 수를 코드로 한 번 더 확인한다.
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
    private final PromptTemplates prompts;
    private final OpenAiProperties props;

    public ReplyGenerationService(LlmClient llmClient, PromptTemplates prompts, OpenAiProperties props) {
        this.llmClient = llmClient;
        this.prompts = prompts;
        this.props = props;
    }

    /**
     * @param storeInfo     사장님이 적은 매장 소개·운영 방식 (없으면 null). 답글은 여기 적힌 내용만 운영 방식으로 언급한다.
     * @param recentReplies 이 가게의 최근 최종 답글 (시작·마무리 표현 반복을 피하기 위한 참고)
     */
    public record Context(String storeName, String category, String storeInfo, ToneProfile tone,
                          int rating, ReviewType type, Sentiment sentiment, List<String> keywords,
                          String maskedContent, List<String> recentReplies) {
    }

    private static final int RECENT_REPLY_MAX_LENGTH = 200;

    /** 톤별 초안. 안전 규칙을 끝까지 어긴 초안은 빠질 수 있다 (모두 빠지면 실패). */
    public Map<ReplyTone, String> generate(Context ctx) {
        String userMessage = userMessage(ctx);
        Map<ReplyTone, String> drafts = call(userMessage);
        List<String> problems = problems(drafts, ctx);
        if (!problems.isEmpty()) {
            log.info("답글 초안 규칙 위반으로 다시 생성: {}", problems);
            drafts = call(userMessage + "\n\n[이전 초안의 문제 — 고쳐서 다시 작성]\n- " + String.join("\n- ", problems));
        }
        Map<ReplyTone, String> safe = new EnumMap<>(ReplyTone.class);
        drafts.forEach((tone, text) -> {
            if (!PROMISE.matcher(text).find() && !MASK.matcher(text).find()) {
                safe.put(tone, text);
            }
        });
        if (safe.isEmpty()) {
            throw new LlmException("안전 규칙을 지키는 답글 초안을 만들지 못했습니다", null, "LLM_INVALID");
        }
        return safe;
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
        drafts.forEach((tone, text) -> {
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
        });
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
        if (!ctx.recentReplies().isEmpty()) {
            sb.append("\n[최근 답글 - 시작·마무리 표현 반복 금지]");
            for (String r : ctx.recentReplies()) {
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
