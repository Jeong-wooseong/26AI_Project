package com.replyboss.masking;

import org.springframework.stereotype.Service;

import java.util.List;
import java.util.regex.Pattern;

/**
 * 리뷰 원문의 개인정보를 치환 문자로 바꾼다. LLM·임베딩 API 로 보내기 전, DB 에 저장하기 전에 항상 거친다.
 * 원문은 이 메서드 밖으로 나가지 않는다.
 */
@Service
public class MaskingService {

    private record Rule(Pattern pattern, String replacement) {
    }

    /** 순서가 중요하다: 이메일 → 주문번호 → 전화번호 → 주소 → 남은 긴 숫자 */
    private static final List<Rule> RULES = List.of(
            new Rule(Pattern.compile("[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+"), "[이메일]"),
            new Rule(Pattern.compile("(주문\\s?번호)\\s*[:：]?\\s*[A-Za-z0-9-]{4,}"), "$1 [주문번호]"),
            new Rule(Pattern.compile("(?:\\+82[-.\\s]?)?0?1[016789][-.\\s]?\\d{3,4}[-.\\s]?\\d{4}"), "[전화번호]"),
            new Rule(Pattern.compile("0(?:2|[3-6][1-5]|70)[-.\\s]?\\d{3,4}[-.\\s]?\\d{4}"), "[전화번호]"),
            new Rule(Pattern.compile("\\d{1,4}\\s?동\\s?\\d{1,4}\\s?호"), "[주소]"),
            new Rule(Pattern.compile("[가-힣]{1,10}(?:로|길)\\s?\\d{1,4}(?:-\\d{1,4})?(?:번길\\s?\\d{1,4})?(?=$|[\\s,.)])"), "[주소]"),
            new Rule(Pattern.compile("(?<![\\d.])\\d{8,}(?![\\d.])"), "[번호]")
    );

    public String mask(String text) {
        if (text == null) {
            return "";
        }
        String result = text.strip();
        for (Rule rule : RULES) {
            result = rule.pattern().matcher(result).replaceAll(rule.replacement());
        }
        return result;
    }
}
