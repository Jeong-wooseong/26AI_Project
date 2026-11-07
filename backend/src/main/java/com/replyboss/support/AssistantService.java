package com.replyboss.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.replyboss.ai.LlmClient;
import com.replyboss.ai.LlmRequest;
import com.replyboss.ai.OpenAiProperties;
import com.replyboss.ai.PromptTemplates;
import com.replyboss.ai.UntrustedText;
import com.replyboss.common.ApiException;
import com.replyboss.masking.MaskingService;
import com.replyboss.support.FaqService.Faq;
import com.replyboss.support.SupportDtos.AssistantRequest;
import com.replyboss.support.SupportDtos.AssistantResponse;
import com.replyboss.support.SupportDtos.ChatMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

import static com.replyboss.ai.Schemas.arrayOf;
import static com.replyboss.ai.Schemas.object;
import static com.replyboss.ai.Schemas.props;
import static com.replyboss.ai.Schemas.string;
import static com.replyboss.ai.Schemas.stringEnum;

/**
 * 고객 지원 도우미 챗봇: 자주 묻는 질문을 근거로만 답하고, 해결할 수 없으면 문의 접수로 연결한다.
 * AI 를 쓸 수 없으면(키 없음·실패) FAQ 검색 결과를 그대로 보여준다.
 * 질문은 개인정보를 가린 뒤 보내고, 대화는 저장하지 않는다.
 */
@Service
public class AssistantService {

    private static final Logger log = LoggerFactory.getLogger(AssistantService.class);
    static final String PROMPT = "support_assistant_v2";
    /** AI 를 쓸 수 없을 때 최근 오류 코드로 먼저 안내할 말 */
    static final Map<String, String> ERROR_HINTS = Map.ofEntries(
            Map.entry("NETWORK", "인터넷이나 ReplyBoss 서버 연결이 끊겼을 수 있어요. 와이파이·인터넷 연결을 확인하고, 다른 사이트가 열리는지 본 뒤 새로고침(F5)해서 다시 시도해 주세요."),
            Map.entry("LLM_TIMEOUT", "AI 응답이 늦어 시간이 초과됐어요. 잠시 뒤 다시 시도해 주세요."),
            Map.entry("LLM_RATE_LIMIT", "짧은 시간에 요청이 많았어요. 1분쯤 뒤 다시 시도해 주세요."),
            Map.entry("LLM_HTTP_429", "짧은 시간에 요청이 많았어요. 1분쯤 뒤 다시 시도해 주세요."),
            Map.entry("LLM_QUOTA", "서비스의 AI 사용 한도가 소진된 상태일 수 있어요. 사장님이 해결할 수 없는 문제라 오류 제보를 남겨 주세요."),
            Map.entry("LLM_NOT_CONFIGURED", "서비스의 AI 연결 설정 문제일 수 있어요. 오류 제보를 남겨 주세요."),
            Map.entry("LLM_UNSAFE", "리뷰 내용 때문에 규칙에 맞는 답글을 만들기 어려웠어요. 다시 생성하거나 직접 작성해 주세요."),
            Map.entry("UNAUTHORIZED", "로그인이 풀린 것 같아요. 다시 로그인해 주세요."),
            Map.entry("CSRF", "보안 토큰이 만료됐어요. 새로고침한 뒤 다시 시도해 주세요."));
    private static final java.util.Set<String> OPERATOR_ERRORS = java.util.Set.of(
            "LLM_QUOTA", "LLM_NOT_CONFIGURED", "LLM_HTTP_401", "LLM_HTTP_403", "MAIL_NOT_CONFIGURED", "MAIL_FAILED");
    static final int LIMIT_PER_WINDOW = 20;
    static final long WINDOW_SECONDS = 600;

    private static final Map<String, Object> SCHEMA = object(props(
            "answer", string(),
            "faqIds", arrayOf(string()),
            "suggestInquiry", Map.of("type", "boolean"),
            "inquiryType", stringEnum(List.of("GENERAL", "BUG", "SUGGESTION", "NONE"))
    ));
    private static final Pattern MARKDOWN = Pattern.compile("\\*\\*|```|<\\s*/?\\s*[A-Za-z][^>]*>");

    private final LlmClient llm;
    private final PromptTemplates prompts;
    private final OpenAiProperties props;
    private final FaqService faqs;
    private final MaskingService masking;
    private final Map<Long, Deque<Instant>> usage = new ConcurrentHashMap<>();

    public AssistantService(LlmClient llm, PromptTemplates prompts, OpenAiProperties props, FaqService faqs,
                            MaskingService masking) {
        this.llm = llm;
        this.prompts = prompts;
        this.props = props;
        this.faqs = faqs;
        this.masking = masking;
    }

    public AssistantResponse answer(Long userId, AssistantRequest request) {
        checkRate(userId);
        String question = masking.mask(request.message());
        try {
            AssistantResponse r = askLlm(question, request.history() == null ? List.of() : request.history(),
                    request.page(), request.lastErrorCode());
            if (r != null) {
                return r;
            }
        } catch (RuntimeException e) {
            log.info("도우미 AI 응답 실패, FAQ 검색으로 대신 답함: {}", e.getMessage());
        }
        return fallback(question, request.lastErrorCode());
    }

    private AssistantResponse askLlm(String question, List<ChatMessage> history, String page, String lastErrorCode) {
        StringBuilder sb = new StringBuilder("[서비스 안내서]\n").append(faqs.guide()).append("\n\n[자주 묻는 질문]\n");
        for (Faq f : faqs.all()) {
            sb.append("- id: ").append(f.id()).append(" / Q: ").append(f.question()).append("\n  A: ").append(f.answer()).append('\n');
        }
        if (!history.isEmpty()) {
            sb.append("[이전 대화]\n");
            for (ChatMessage m : history) {
                String text = masking.mask(m.text());
                sb.append("user".equals(m.role()) ? "- 사용자: " : "- 도우미: ")
                        .append(text.length() > 300 ? text.substring(0, 300) + "…" : text).append('\n');
            }
        }
        sb.append("[사용자 상황]\n- 지금 화면: ").append(page == null || page.isBlank() ? "알 수 없음" : page)
                .append("\n- 최근 오류 코드: ").append(lastErrorCode == null || lastErrorCode.isBlank() ? "없음" : lastErrorCode).append('\n');
        sb.append("[이번 질문]\n<question>\n").append(question.replace("<", "‹").replace(">", "›")).append("\n</question>")
                .append(UntrustedText.injectionNotice(question));
        JsonNode json = llm.generateJson(new LlmRequest(props.classifyModel(), prompts.render(PROMPT, Map.of()),
                sb.toString(), "support_answer", SCHEMA, 2000));
        String answer = json.path("answer").asText("").strip();
        if (answer.isEmpty() || MARKDOWN.matcher(answer).find()) {
            return null;
        }
        List<String> ids = new ArrayList<>();
        json.path("faqIds").forEach(n -> {
            if (faqs.exists(n.asText()) && !ids.contains(n.asText())) {
                ids.add(n.asText());
            }
        });
        boolean suggest = json.path("suggestInquiry").asBoolean(false);
        InquiryType type = switch (json.path("inquiryType").asText("NONE")) {
            case "BUG" -> InquiryType.BUG;
            case "SUGGESTION" -> InquiryType.SUGGESTION;
            case "GENERAL" -> InquiryType.GENERAL;
            default -> null;
        };
        if (suggest && type == null) {
            type = InquiryType.GENERAL;
        }
        return new AssistantResponse(answer, ids, suggest, suggest ? type : null, "AI");
    }

    /** AI 없이: 최근 오류 코드가 있으면 그 안내를, 아니면 FAQ 검색 상위 결과를 보여주고, 맞는 항목이 없으면 문의를 권한다 */
    AssistantResponse fallback(String question, String lastErrorCode) {
        String hint = lastErrorCode == null ? null : ERROR_HINTS.get(lastErrorCode);
        List<FaqService.Match> matches = faqs.search(question, 1);
        boolean found = !matches.isEmpty() && matches.get(0).score() >= 2;
        if (hint != null) {
            boolean operator = OPERATOR_ERRORS.contains(lastErrorCode);
            return new AssistantResponse("최근 화면에 오류 코드 " + lastErrorCode + "가 나왔어요. " + hint,
                    found ? List.of(matches.get(0).faq().id()) : List.of(), operator, operator ? InquiryType.BUG : null, "FAQ");
        }
        if (!found) {
            return new AssistantResponse(
                    "자주 묻는 질문에서 맞는 답을 찾지 못했어요. 고객 지원에서 문의를 남겨 주시면 확인해 드릴게요.",
                    List.of(), true, InquiryType.GENERAL, "FAQ");
        }
        Faq f = matches.get(0).faq();
        return new AssistantResponse(f.answer(), List.of(f.id()), false, null, "FAQ");
    }

    /** 한 사람이 10분에 20번까지 (AI 비용·남용 방지, 서버 메모리 기준) */
    private void checkRate(Long userId) {
        Instant now = Instant.now();
        Deque<Instant> q = usage.computeIfAbsent(userId, k -> new ArrayDeque<>());
        synchronized (q) {
            while (!q.isEmpty() && q.peekFirst().isBefore(now.minusSeconds(WINDOW_SECONDS))) {
                q.pollFirst();
            }
            if (q.size() >= LIMIT_PER_WINDOW) {
                throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_REQUESTS",
                        "질문이 많아 잠시 쉬어 갈게요. 몇 분 뒤 다시 질문하거나 자주 묻는 질문을 확인하십시오.");
            }
            q.addLast(now);
        }
    }
}
