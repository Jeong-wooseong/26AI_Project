package com.replyboss.store;

import com.fasterxml.jackson.databind.JsonNode;
import com.replyboss.ai.ClaudeProperties;
import com.replyboss.ai.LlmClient;
import com.replyboss.ai.LlmRequest;
import com.replyboss.ai.PromptTemplates;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.replyboss.ai.Schemas.arrayOf;
import static com.replyboss.ai.Schemas.object;
import static com.replyboss.ai.Schemas.props;
import static com.replyboss.ai.Schemas.string;
import static com.replyboss.ai.Schemas.stringEnum;

/**
 * 기능 2. 예시 답글 3~5개에서 가게 말투를 뽑는다. 저장은 사장님이 확인한 뒤 StoreService.updateTone 으로.
 */
@Service
public class ToneProfileService {

    static final String PROMPT = "tone_extract_v1";

    private static final Map<String, Object> SCHEMA = object(props(
            "formality", stringEnum(ToneProfile.FORMALITIES),
            "emojiLevel", stringEnum(ToneProfile.EMOJI_LEVELS),
            "emojiExamples", arrayOf(string()),
            "length", stringEnum(ToneProfile.LENGTHS),
            "phrases", arrayOf(string()),
            "closing", string()
    ));

    private final LlmClient llmClient;
    private final PromptTemplates prompts;
    private final ClaudeProperties props;

    public ToneProfileService(LlmClient llmClient, PromptTemplates prompts, ClaudeProperties props) {
        this.llmClient = llmClient;
        this.prompts = prompts;
        this.props = props;
    }

    public ToneProfile extract(List<String> sampleReplies) {
        List<String> samples = sampleReplies.stream().map(String::trim).filter(s -> !s.isEmpty()).toList();

        StringBuilder user = new StringBuilder("[예시 답글]\n");
        for (int i = 0; i < samples.size(); i++) {
            user.append(i + 1).append(". ").append(samples.get(i)).append('\n');
        }

        JsonNode json = llmClient.generateJson(new LlmRequest(
                props.classifyModel(),
                prompts.render(PROMPT, Map.of()),
                user.toString(),
                SCHEMA,
                600,
                0.2
        ));
        return sanitize(json, samples);
    }

    /** 예시에 실제로 없는 표현·이모지는 버린다 (AI 가 지어낸 말투가 저장되지 않도록). */
    static ToneProfile sanitize(JsonNode json, List<String> samples) {
        String all = String.join("\n", samples);

        List<String> phrases = keepPresent(json.path("phrases"), all, 5);
        List<String> emojis = keepPresent(json.path("emojiExamples"), all, 5);

        String emojiLevel = json.path("emojiLevel").asText("없음");
        if (emojis.isEmpty()) {
            emojiLevel = "없음";
        } else if (!"가끔".equals(emojiLevel) && !"자주".equals(emojiLevel)) {
            emojiLevel = "가끔";
        }

        String formality = json.path("formality").asText("해요체");
        if (!ToneProfile.FORMALITIES.contains(formality)) {
            formality = "해요체";
        }
        String length = json.path("length").asText("2~3문장");
        if (!ToneProfile.LENGTHS.contains(length)) {
            length = "2~3문장";
        }
        String closing = json.path("closing").asText("").trim();
        if (!closing.isEmpty() && !all.contains(closing)) {
            closing = "";
        }

        return new ToneProfile(formality, emojiLevel, emojis, length, phrases, closing);
    }

    private static List<String> keepPresent(JsonNode array, String text, int limit) {
        Set<String> kept = new LinkedHashSet<>();
        for (JsonNode node : array) {
            String value = node.asText("").trim();
            if (!value.isEmpty() && text.contains(value)) {
                kept.add(value);
            }
            if (kept.size() == limit) {
                break;
            }
        }
        return new ArrayList<>(kept);
    }
}
