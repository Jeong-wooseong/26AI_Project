package com.replyboss.ai;

/** 응답이 max_completion_tokens 에서 잘린 경우. 추론 모델은 추론 토큰도 이 한도를 쓰므로 한도를 늘려 다시 시도할 수 있다. */
public class LlmTruncatedException extends LlmException {

    public LlmTruncatedException(String message) {
        super(message, null, "LLM_TRUNCATED");
    }
}
