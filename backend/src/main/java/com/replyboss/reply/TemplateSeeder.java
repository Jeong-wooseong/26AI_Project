package com.replyboss.reply;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * 평점만 리뷰용 템플릿 풀을 처음 실행할 때 한 번 넣는다.
 * 규칙: 본문이 없는 리뷰이므로 맛·배달·양 같은 내용을 추측해 쓰지 않는다.
 * 마무리 인사와 이모지는 넣지 않는다 (가게 톤 프로필에서 붙인다).
 */
@Component
public class TemplateSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(TemplateSeeder.class);

    private static final String HAEYO = "해요체";
    private static final String HASIPSIO = "하십시오체";

    private final ReplyTemplateRepository repository;

    public TemplateSeeder(ReplyTemplateRepository repository) {
        this.repository = repository;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (repository.count() > 0) {
            return;
        }
        List<ReplyTemplate> templates = new ArrayList<>();

        // 4~5점: 감사
        add(templates, 4, 5, HAEYO,
                "좋은 별점 남겨주셔서 감사드려요. 다음에도 만족하실 수 있게 정성껏 준비할게요.",
                "별점으로 응원해주셔서 감사해요. 덕분에 오늘도 힘이 나요.",
                "찾아주셔서 감사드려요. 다음에 또 뵐 수 있으면 좋겠어요.");
        add(templates, 4, 5, HASIPSIO,
                "좋은 별점 남겨주셔서 감사드립니다. 다음에도 만족하실 수 있도록 정성껏 준비하겠습니다.",
                "별점으로 응원해주셔서 감사합니다. 큰 힘이 됩니다.",
                "저희 가게를 찾아주셔서 감사드립니다. 다음에도 찾아주시길 기다리겠습니다.");

        // 3점: 감사 + 개선 의견 요청
        add(templates, 3, 3, HAEYO,
                "별점 남겨주셔서 감사드려요. 아쉬우셨던 점이 있다면 알려주시면 꼭 참고할게요.",
                "찾아주셔서 감사해요. 더 좋아질 수 있는 부분을 말씀해주시면 반영해볼게요.",
                "소중한 별점 감사드려요. 다음에는 더 만족하실 수 있게 어떤 점이 아쉬웠는지 들려주세요.");
        add(templates, 3, 3, HASIPSIO,
                "별점 남겨주셔서 감사드립니다. 아쉬우셨던 점이 있다면 알려주시면 꼭 참고하겠습니다.",
                "찾아주셔서 감사합니다. 개선할 부분을 말씀해주시면 반영하도록 하겠습니다.",
                "소중한 별점 감사드립니다. 어떤 점이 아쉬우셨는지 알려주시면 더 나아지도록 노력하겠습니다.");

        // 1~2점: 사과 + 불편했던 점 문의
        add(templates, 1, 2, HAEYO,
                "만족스럽지 못한 경험을 드려 죄송해요. 어떤 점이 불편하셨는지 알려주시면 바로 살펴볼게요.",
                "기대에 못 미쳐 죄송한 마음이에요. 불편하셨던 부분을 말씀해주시면 꼭 개선할게요.",
                "아쉬운 경험을 드려 죄송해요. 무엇이 문제였는지 알려주시면 더 신경 쓸게요.");
        add(templates, 1, 2, HASIPSIO,
                "만족스럽지 못한 경험을 드려 죄송합니다. 어떤 점이 불편하셨는지 알려주시면 바로 확인하겠습니다.",
                "기대에 미치지 못해 죄송합니다. 불편하셨던 부분을 말씀해주시면 꼭 개선하겠습니다.",
                "아쉬운 경험을 드려 죄송합니다. 문제가 된 부분을 알려주시면 더 세심히 살피겠습니다.");

        repository.saveAll(templates);
        log.info("평점만 리뷰 템플릿 {}개를 등록했습니다", templates.size());
    }

    private static void add(List<ReplyTemplate> list, int min, int max, String formality, String... contents) {
        for (String content : contents) {
            list.add(new ReplyTemplate(min, max, formality, content));
        }
    }
}
