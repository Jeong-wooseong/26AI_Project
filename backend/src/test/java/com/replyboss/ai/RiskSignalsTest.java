package com.replyboss.ai;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RiskSignalsTest {

    @Test
    void 건강_환불_법적_대응_신호를_찾는다() {
        assertThat(RiskSignals.of("환불해 주세요. 먹고 배탈이 났습니다.")).containsExactly("건강·위생", "환불·보상");
        assertThat(RiskSignals.of("머리카락이 나왔어요. 구청에 신고할게요")).containsExactly("건강·위생", "법적 대응");
        assertThat(RiskSignals.notice("배달이 늦었어요")).isEmpty();
        assertThat(RiskSignals.of("라떼 맛있어요")).isEmpty();
        assertThat(RiskSignals.notice("음식에서 벌레가 나왔어요")).contains("[매장 연락처 입력]").contains("약속하지 말고");
    }
}
