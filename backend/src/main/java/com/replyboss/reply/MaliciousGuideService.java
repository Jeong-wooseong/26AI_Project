package com.replyboss.reply;

import com.fasterxml.jackson.databind.JsonNode;
import com.replyboss.ai.LlmClient;
import com.replyboss.ai.LlmException;
import com.replyboss.ai.LlmRequest;
import com.replyboss.ai.OpenAiProperties;
import com.replyboss.ai.PromptTemplates;
import com.replyboss.store.ToneProfile;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import static com.replyboss.ai.Schemas.arrayOf;
import static com.replyboss.ai.Schemas.object;
import static com.replyboss.ai.Schemas.props;
import static com.replyboss.ai.Schemas.string;
import static com.replyboss.ai.Schemas.stringEnum;

/**
 * 기능 5. 악성 리뷰 대응 가이드: 전략 3종(사과 후 마무리 / 사실 관계 설명 / 응대 보류·신고 검토) 중 추천,
 * 추천 근거, 사장님이 확인할 것, 전략에 맞는 답글 초안. 답글은 사장님 확인 후에만 확정할 수 있다.
 */
@Service
public class MaliciousGuideService {

    private static final Logger log = LoggerFactory.getLogger(MaliciousGuideService.class);
    static final String PROMPT = "malicious_guide_v1";

    private static final Map<String, Object> SCHEMA = object(props(
            "strategy", stringEnum(Arrays.stream(GuideStrategy.values()).map(Enum::name).toList()),
            "reason", string(),
            "checklist", arrayOf(string()),
            "reply", string()
    ));

    /** 답글에 쓰면 안 되는 위협성 표현 */
    static final Pattern THREAT = Pattern.compile("고소|법적\\s*(조치|대응)|경찰|신고하겠|신고할\\s*예정|형사");

    private final LlmClient llmClient;
    private final PromptTemplates prompts;
    private final OpenAiProperties props;

    public MaliciousGuideService(LlmClient llmClient, PromptTemplates prompts, OpenAiProperties props) {
        this.llmClient = llmClient;
        this.prompts = prompts;
        this.props = props;
    }

    /** chosen 이 null 이면 추천을 받는다 */
    public record Context(String storeName, String category, String storeInfo, ToneProfile tone,
                          int rating, List<String> keywords, String maskedContent, GuideStrategy chosen) {
    }

    public record Guide(GuideStrategy strategy, String reason, List<String> checklist, String reply) {
    }

    public Guide generate(Context ctx) {
        String user = userMessage(ctx);
        Guide guide = call(user, ctx.chosen());
        List<String> problems = problems(guide.reply());
        if (!problems.isEmpty()) {
            log.info("악성 리뷰 가이드 답글 규칙 위반으로 다시 생성: {}", problems);
            guide = call(user + "\n\n[이전 답글의 문제 — 고쳐서 다시 작성]\n- " + String.join("\n- ", problems), ctx.chosen());
            if (!problems(guide.reply()).isEmpty()) {
                throw new LlmException("안전 규칙을 지키는 대응 답글을 만들지 못했습니다", null, "LLM_INVALID");
            }
        }
        return guide;
    }

    private Guide call(String user, GuideStrategy chosen) {
        JsonNode json = llmClient.generateJson(new LlmRequest(
                props.generateModel(), prompts.render(PROMPT, Map.of()), user, "malicious_guide", SCHEMA, 2500));
        GuideStrategy strategy;
        try {
            strategy = GuideStrategy.valueOf(json.path("strategy").asText(""));
        } catch (IllegalArgumentException e) {
            throw new LlmException("대응 전략 형식이 올바르지 않습니다", null, "LLM_INVALID");
        }
        if (chosen != null) {
            strategy = chosen; // 사장님이 고른 전략을 따른다
        }
        String reply = json.path("reply").asText("").strip();
        String reason = json.path("reason").asText("").strip();
        if (reply.isEmpty() || reason.isEmpty()) {
            throw new LlmException("대응 가이드가 비어 있습니다", null, "LLM_INVALID");
        }
        List<String> checklist = new ArrayList<>();
        json.path("checklist").forEach(n -> {
            String item = n.asText("").strip();
            if (!item.isEmpty() && checklist.size() < 5) {
                checklist.add(item);
            }
        });
        return new Guide(strategy, reason, checklist, reply.length() > 2000 ? reply.substring(0, 2000) : reply);
    }

    static List<String> problems(String reply) {
        List<String> problems = new ArrayList<>();
        if (ReplyGenerationService.PROMISE.matcher(reply).find()) {
            problems.add("정하지 않은 보상·할인 약속 표현이 있음");
        }
        if (ReplyGenerationService.MASK.matcher(reply).find()) {
            problems.add("개인정보 가림 표시를 그대로 씀");
        }
        if (THREAT.matcher(reply).find()) {
            problems.add("고소·신고 같은 위협성 표현이 있음");
        }
        return problems;
    }

    static String userMessage(Context ctx) {
        StringBuilder sb = new StringBuilder();
        sb.append("[매장] ").append(ctx.storeName()).append(" (").append(ctx.category()).append(")\n");
        sb.append("[확인된 매장 정보] ")
                .append(ctx.storeInfo() == null || ctx.storeInfo().isBlank() ? "없음" : ctx.storeInfo().strip()).append('\n');
        sb.append("[매장 말투] 높임말: ").append(ctx.tone() == null ? "하십시오체" : ctx.tone().formality()).append('\n');
        sb.append("[사장님이 고른 전략] ").append(ctx.chosen() == null ? "추천 요청" : ctx.chosen().name()).append('\n');
        sb.append("[리뷰]\n");
        sb.append("- 별점: ").append(ctx.rating()).append('\n');
        sb.append("- 키워드: ").append(ctx.keywords().isEmpty() ? "없음" : String.join(", ", ctx.keywords())).append('\n');
        sb.append("- 본문: ").append(ctx.maskedContent());
        return sb.toString();
    }
}
