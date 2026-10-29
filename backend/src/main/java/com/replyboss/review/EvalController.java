package com.replyboss.review;

import com.replyboss.masking.MaskingService;
import com.replyboss.review.ReviewDtos.EvalClassifyRequest;
import com.replyboss.review.ReviewDtos.EvalClassifyResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 분류 정확도 측정용 API (eval/classify_eval.mjs 가 호출).
 * 실제 입력 흐름과 같은 마스킹·분기·분류를 거치지만 DB 에 저장하지 않는다.
 */
@RestController
public class EvalController {

    private final MaskingService maskingService;
    private final ClassificationService classificationService;

    public EvalController(MaskingService maskingService, ClassificationService classificationService) {
        this.maskingService = maskingService;
        this.classificationService = classificationService;
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
