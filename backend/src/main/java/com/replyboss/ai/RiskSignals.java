package com.replyboss.ai;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * 사장님이 직접 판단해야 하는 고위험 리뷰 신호 (건강·위생 피해, 환불·보상 요구, 법적 대응).
 * 리뷰 유형(칭찬·불만 등)과 별개로 표시하며, 답글 초안은 만들되 원인 인정·약속 없이 매장 연락을 안내하게 한다.
 */
public final class RiskSignals {

    private RiskSignals() {
    }

    private record Signal(String label, Pattern pattern) {
    }

    private static final List<Signal> SIGNALS = List.of(
            new Signal("건강·위생", Pattern.compile(
                    "배탈|설사|구토|토했|식중독|탈이\\s*(났|나서)|병원|응급실|알레르기|알러지|두드러기"
                            + "|이물질|머리카락|벌레|날파리|바퀴|플라스틱|철수세미|곰팡이|상한\\s*(음식|맛|냄새)|쉰\\s*냄새")),
            new Signal("환불·보상", Pattern.compile("환불|보상|배상|돈\\s*(돌려|물어)|재배달")),
            new Signal("법적 대응", Pattern.compile("고소|소송|법적|신고\\s*(하|할|했)|경찰|식약처|위생과|구청에"))
    );

    /** 해당하는 신호 이름들 (없으면 빈 목록) */
    public static List<String> of(String text) {
        List<String> out = new ArrayList<>();
        if (text == null || text.isBlank()) {
            return out;
        }
        for (Signal s : SIGNALS) {
            if (s.pattern().matcher(text).find()) {
                out.add(s.label());
            }
        }
        return out;
    }

    /** 고위험 리뷰일 때 프롬프트에 덧붙일 안내 (없으면 빈 문자열) */
    public static String notice(String text) {
        List<String> labels = of(text);
        if (labels.isEmpty()) {
            return "";
        }
        return "\n[주의] 사장님 확인이 필요한 리뷰다 (" + String.join(", ", labels) + "). 원인이나 책임을 인정하거나 부정하지 말고,"
                + " 환불·보상·재배달을 약속하지 말고, 불편에 공감한 뒤 매장으로 연락해 주시면 확인하겠다고 안내한다."
                + " 연락처는 [매장 연락처 입력]처럼 채울 자리로 남긴다.";
    }
}
