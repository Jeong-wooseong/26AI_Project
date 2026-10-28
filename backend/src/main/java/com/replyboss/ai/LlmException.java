package com.replyboss.ai;

/** LLM 호출이 재시도 후에도 실패했을 때. 화면에는 재시도 버튼으로 이어진다. */
public class LlmException extends RuntimeException {

    public LlmException(String message) {
        super(message);
    }

    public LlmException(String message, Throwable cause) {
        super(message, cause);
    }
}
