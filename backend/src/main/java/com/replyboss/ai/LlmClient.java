package com.replyboss.ai;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * LLM 호출 추상화. 서비스는 이 인터페이스에만 의존하고, 테스트에서는 가짜 구현으로 바꾼다.
 */
public interface LlmClient {

    /** 스키마에 맞는 JSON 을 돌려준다. 재시도 후에도 실패하면 {@link LlmException}. */
    JsonNode generateJson(LlmRequest request);
}
