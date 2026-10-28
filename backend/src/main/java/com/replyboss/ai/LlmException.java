package com.replyboss.ai;

/**
 * LLM 호출이 재시도 후에도 실패했을 때. 화면에는 재시도 버튼으로 이어진다.
 * reason 은 화면에 실패 이유를 보여주기 위한 코드다.
 *  LLM_TRUNCATED(길이 한도에서 잘림), LLM_TIMEOUT(응답 시간 초과), LLM_HTTP_<상태코드>(OpenAI 오류 응답),
 *  LLM_REFUSED(모델 거절), LLM_INVALID(응답 형식 오류), LLM_FAILED(그 밖의 실패)
 */
public class LlmException extends RuntimeException {

    private final String reason;

    public LlmException(String message) {
        this(message, null, "LLM_FAILED");
    }

    public LlmException(String message, Throwable cause) {
        this(message, cause, "LLM_FAILED");
    }

    public LlmException(String message, Throwable cause, String reason) {
        super(message, cause);
        this.reason = reason;
    }

    public String getReason() {
        return reason;
    }
}
