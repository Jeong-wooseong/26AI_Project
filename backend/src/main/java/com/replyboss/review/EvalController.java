package com.replyboss.review;

import com.replyboss.ai.LlmException;
import com.replyboss.ai.RiskSignals;
import com.replyboss.ai.UntrustedText;
import com.replyboss.common.ApiException;
import com.replyboss.common.JsonText;
import com.replyboss.masking.MaskingService;
import com.replyboss.reply.MaliciousGuideService;
import com.replyboss.reply.ReplyGenerationService;
import com.replyboss.review.ReviewDtos.EvalReplyRequest;
import com.replyboss.review.ReviewDtos.EvalReplyResponse;
import com.replyboss.store.Store;
import com.replyboss.store.StoreService;
import com.replyboss.store.ToneProfile;
import com.replyboss.review.ReviewDtos.EvalClassifyRequest;
import com.replyboss.review.ReviewDtos.EvalClassifyResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 측정용 API: 분류 정확도(eval/classify_eval.mjs), 답글 안전성(eval/reply_safety_eval.mjs).
 * 실제 입력 흐름과 같은 마스킹·분기·분류를 거치지만 DB 에 저장하지 않는다.
 */
@RestController
public class EvalController {

    private final MaskingService maskingService;
    private final ClassificationService classificationService;
    private final ReplyGenerationService replyGenerationService;
    private final MaliciousGuideService maliciousGuideService;
    private final StoreService storeService;

    public EvalController(MaskingService maskingService, ClassificationService classificationService,
                          ReplyGenerationService replyGenerationService, MaliciousGuideService maliciousGuideService,
                          StoreService storeService) {
        this.maskingService = maskingService;
        this.classificationService = classificationService;
        this.replyGenerationService = replyGenerationService;
        this.maliciousGuideService = maliciousGuideService;
        this.storeService = storeService;
    }

    /**
     * 답글 안전성 점검용 (eval/reply_safety_eval.mjs 가 호출). 실제와 같은 마스킹·분류·생성·검사를 거치지만 저장하지 않는다.
     * 이전 답글 비교(중복 방지 2·3단)는 하지 않는다. AI 호출이 실패해도 오류 코드를 담아 돌려줘 다음 사례를 계속 점검하게 한다.
     */
    @PostMapping("/api/eval/replies")
    public EvalReplyResponse replies(@Valid @RequestBody EvalReplyRequest request) {
        Store store = storeService.get(request.storeId());
        ToneProfile tone = JsonText.read(store.getToneProfile(), ToneProfile.class);
        if (tone == null) {
            throw ApiException.badRequest("NO_TONE", "매장 설정에서 답글 스타일을 먼저 저장하십시오.");
        }
        String masked = maskingService.mask(request.content());
        boolean injection = UntrustedText.looksLikeInjection(masked);
        List<String> risks = RiskSignals.of(masked);
        if (masked.isBlank()) {
            return new EvalReplyResponse("", ReviewType.RATING_ONLY, Sentiment.fromRating(request.rating()), List.of(),
                    false, risks, Map.of(), 0, null, null, null, null, null);
        }
        ClassificationResult c;
        try {
            c = classificationService.classify(request.rating(), masked);
        } catch (LlmException e) {
            return new EvalReplyResponse(masked, null, null, List.of(), injection, risks, Map.of(), 0, null, null, null,
                    e.getReason(), e.getMessage());
        }
        try {
            if (c.type() == ReviewType.MALICIOUS) {
                MaliciousGuideService.Guide g = maliciousGuideService.generate(new MaliciousGuideService.Context(
                        store.getName(), store.getCategory(), store.getInfo(), tone,
                        request.rating(), c.keywords(), masked, null));
                return new EvalReplyResponse(masked, c.type(), c.sentiment(), c.keywords(), injection, risks, Map.of(), 0,
                        g.strategy().name(), g.reason(), g.reply(), null, null);
            }
            ReplyGenerationService.Result r = replyGenerationService.generate(new ReplyGenerationService.Context(
                    store.getName(), store.getCategory(), store.getInfo(), tone,
                    request.rating(), c.type(), c.sentiment(), c.keywords(), masked, List.of()));
            Map<String, String> drafts = new LinkedHashMap<>();
            r.drafts().forEach((t, d) -> drafts.put(t.name(), d.text()));
            return new EvalReplyResponse(masked, c.type(), c.sentiment(), c.keywords(), injection, risks, drafts,
                    r.regenerations(), null, null, null, null, null);
        } catch (LlmException e) {
            return new EvalReplyResponse(masked, c.type(), c.sentiment(), c.keywords(), injection, risks, Map.of(), 0,
                    null, null, null, e.getReason(), e.getMessage());
        }
    }

    @PostMapping("/api/eval/classify")
    public EvalClassifyResponse classify(@Valid @RequestBody EvalClassifyRequest request) {
        String masked = maskingService.mask(request.content());
        if (masked.isBlank()) {
            return new EvalClassifyResponse("", ReviewType.RATING_ONLY, Sentiment.fromRating(request.rating()),
                    List.of(), 1.0, true, 0);
        }
        long start = System.currentTimeMillis();
        ClassificationResult result = classificationService.classify(request.rating(), masked);
        return new EvalClassifyResponse(masked, result.type(), result.sentiment(), result.keywords(),
                result.confidence(), false, System.currentTimeMillis() - start);
    }
}
