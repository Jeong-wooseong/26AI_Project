package com.replyboss.ai;

import java.util.List;

/**
 * 문장 임베딩 (중복 답글 방지용). 실패하면 {@link LlmException} 이나 ApiException 을 던지며,
 * 호출하는 쪽은 임베딩 없이도 기능이 동작하도록 실패를 삼킨다.
 */
public interface EmbeddingClient {

    /** texts 와 같은 순서의 벡터 목록 */
    List<float[]> embed(List<String> texts);
}
