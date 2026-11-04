package com.replyboss.support;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/** 자주 묻는 질문 (resources/support/faq.json). 고객 지원 화면과 도우미 챗봇이 같은 내용을 쓴다 */
@Service
public class FaqService {

    public record Faq(String id, String category, String question, String answer, List<String> keywords) {
    }

    public record Match(Faq faq, int score) {
    }

    private final List<Faq> faqs;
    private final String guide;

    public FaqService(ObjectMapper mapper) {
        try (InputStream in = new ClassPathResource("support/faq.json").getInputStream()) {
            this.faqs = List.copyOf(mapper.readValue(in, new TypeReference<List<Faq>>() { }));
        } catch (IOException e) {
            throw new UncheckedIOException("FAQ 를 읽을 수 없습니다", e);
        }
        try (InputStream in = new ClassPathResource("support/service_guide.md").getInputStream()) {
            this.guide = new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("서비스 안내서를 읽을 수 없습니다", e);
        }
    }

    /** 도우미가 근거로 쓰는 서비스 안내서 (resources/support/service_guide.md) */
    public String guide() {
        return guide;
    }

    public List<Faq> all() {
        return faqs;
    }

    public boolean exists(String id) {
        return faqs.stream().anyMatch(f -> f.id().equals(id));
    }

    /** AI 를 쓸 수 없을 때의 대체 검색: 키워드·질문 낱말이 질문에 얼마나 나오는지로 점수를 매긴다 */
    public List<Match> search(String text, int limit) {
        String q = text == null ? "" : text.toLowerCase(Locale.ROOT);
        return faqs.stream()
                .map(f -> new Match(f, score(f, q)))
                .filter(m -> m.score() > 0)
                .sorted(Comparator.comparingInt(Match::score).reversed())
                .limit(limit)
                .toList();
    }

    private static int score(Faq f, String q) {
        int score = 0;
        for (String k : f.keywords()) {
            if (q.contains(k.toLowerCase(Locale.ROOT))) {
                score += 3;
            }
        }
        for (String word : f.question().split("[\\s,.?!·']+")) {
            String w = word.replaceAll("(은|는|이|가|을|를|에|요|나요|하면|되나요)$", "");
            if (w.length() >= 2 && q.contains(w.toLowerCase(Locale.ROOT))) {
                score += 1;
            }
        }
        return score;
    }
}
