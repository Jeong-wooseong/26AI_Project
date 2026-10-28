package com.replyboss.common;

import com.replyboss.ai.LlmException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ErrorResponse> handleApi(ApiException e) {
        return ResponseEntity.status(e.getStatus()).body(new ErrorResponse(e.getCode(), e.getMessage()));
    }

    /** LLM 호출 실패: 프론트엔드는 이 코드를 보고 실패 이유와 [다시 시도] 버튼을 보여준다. */
    @ExceptionHandler(LlmException.class)
    public ResponseEntity<ErrorResponse> handleLlm(LlmException e) {
        log.warn("LLM 호출 실패 [{}]: {}", e.getReason(), e.getMessage());
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(new ErrorResponse(e.getReason(), llmMessage(e.getReason())));
    }

    static String llmMessage(String reason) {
        if (reason == null) {
            reason = "LLM_FAILED";
        }
        return switch (reason) {
            case "LLM_TRUNCATED" -> "AI 응답이 길이 한도에서 잘렸습니다. 다시 시도하십시오.";
            case "LLM_TIMEOUT" -> "AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도하십시오.";
            case "LLM_REFUSED" -> "AI가 이 리뷰의 분석을 거절했습니다.";
            case "LLM_INVALID" -> "AI 응답 형식이 올바르지 않습니다. 다시 시도하십시오.";
            case "LLM_HTTP_401", "LLM_HTTP_403" -> "OpenAI API 키가 유효하지 않습니다. backend/.env의 OPENAI_API_KEY를 확인하십시오.";
            case "LLM_HTTP_429" -> "OpenAI 사용 한도를 초과했거나 요청이 많습니다. 잠시 후 다시 시도하거나 결제·한도를 확인하십시오.";
            case "LLM_HTTP_400" -> "OpenAI가 요청을 거부했습니다(HTTP 400). 서버 로그의 원인을 확인하십시오.";
            default -> reason.startsWith("LLM_HTTP_5")
                    ? "OpenAI 서버 오류입니다. 잠시 후 다시 시도하십시오."
                    : "AI 응답을 받지 못했습니다. 잠시 후 다시 시도하십시오.";
        };
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(err -> err.getDefaultMessage())
                .orElse("입력값을 확인하십시오.");
        return ResponseEntity.badRequest().body(new ErrorResponse("INVALID_INPUT", message));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleUnreadable(HttpMessageNotReadableException e) {
        return ResponseEntity.badRequest().body(new ErrorResponse("INVALID_INPUT", "요청 형식이 올바르지 않습니다."));
    }
}
