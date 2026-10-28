package com.replyboss.reply;

import com.replyboss.review.Review;
import com.replyboss.store.ToneProfile;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 평점만 리뷰 답글 (LLM 미사용).
 * 4~5점 감사 / 3점 감사+의견 요청 / 1~2점 사과+문의.
 * 템플릿 풀에서 고른 뒤 톤 프로필로 가볍게 바꾼다: 존댓말 수준, 이모지, 마무리 인사, 문장 길이.
 *
 * 문장 길이 (템플릿은 2문장):
 *  - 1~2문장: 템플릿만 (마무리 인사 생략)
 *  - 2~3문장: 템플릿 + 마무리 인사
 *  - 3~4문장: 템플릿 + 덧붙임 한 문장(자주 쓰는 표현 또는 별점별 기본 문장) + 마무리 인사
 */
@Service
public class RatingOnlyReplyService {

    private final ReplyTemplateRepository templateRepository;
    private final ReplyRepository replyRepository;

    public RatingOnlyReplyService(ReplyTemplateRepository templateRepository, ReplyRepository replyRepository) {
        this.templateRepository = templateRepository;
        this.replyRepository = replyRepository;
    }

    @Transactional
    public Reply createReply(Review review, Long storeId, ToneProfile tone) {
        String formality = tone != null && "하십시오체".equals(tone.formality()) ? "하십시오체" : "해요체";
        List<ReplyTemplate> candidates = templateRepository
                .findByRatingMinLessThanEqualAndRatingMaxGreaterThanEqualAndFormality(
                        review.getRating(), review.getRating(), formality);
        if (candidates.isEmpty()) {
            throw new IllegalStateException("템플릿이 없습니다: rating=" + review.getRating() + ", " + formality);
        }

        ReplyTemplate template = pick(candidates, storeId);
        String content = applyTone(template.getContent(), review.getRating(), tone);
        return replyRepository.save(new Reply(review, template, ReplyTone.TEMPLATE, content));
    }

    /** 최근에 쓴 템플릿을 피해 고른다. 후보가 모두 최근에 쓰였으면 전체에서 고른다. */
    private ReplyTemplate pick(List<ReplyTemplate> candidates, Long storeId) {
        Set<Long> recent = new HashSet<>(replyRepository.findRecentTemplateIds(
                storeId, PageRequest.of(0, Math.max(1, candidates.size() - 1))));
        List<ReplyTemplate> fresh = candidates.stream().filter(t -> !recent.contains(t.getId())).toList();
        List<ReplyTemplate> pool = fresh.isEmpty() ? candidates : fresh;
        return pool.get(ThreadLocalRandom.current().nextInt(pool.size()));
    }

    static String applyTone(String base, int rating, ToneProfile tone) {
        if (tone == null) {
            return base;
        }
        StringBuilder sb = new StringBuilder(base);
        if ("3~4문장".equals(tone.length())) {
            String extra = extraSentence(base, rating, tone);
            if (extra != null) {
                sb.append(' ').append(extra);
            }
        }
        // 사과 답글(1~2점)에는 이모지를 붙이지 않는다
        if (rating >= 4 && tone.usesEmoji()) {
            sb.append(' ').append(tone.emojiExamples().get(0));
        }
        // 이미 같은 뜻의 인사(감사·좋은 하루 등)가 있으면 마무리 인사를 붙이지 않는다. 1~2문장이면 생략
        if (rating >= 3 && !"1~2문장".equals(tone.length()) && !Greetings.overlaps(sb.toString(), tone.closing())) {
            sb.append(' ').append(tone.closing());
        }
        return sb.toString();
    }

    /**
     * 3~4문장일 때 덧붙일 한 문장.
     * 높은 별점은 가게가 자주 쓰는 표현(템플릿과 뜻이 겹치지 않는 것)을 먼저 쓰고, 없으면 별점별 기본 문장.
     */
    static String extraSentence(String base, int rating, ToneProfile tone) {
        if (rating >= 4) {
            for (String phrase : tone.phrases()) {
                String p = phrase.strip();
                if (p.length() >= 4 && !base.contains(p) && !Greetings.overlaps(base, p)
                        && !Greetings.overlaps(p, tone.closing())) {
                    return endSentence(p);
                }
            }
        }
        boolean formal = "하십시오체".equals(tone.formality());
        if (rating >= 4) {
            return formal ? "앞으로도 변함없는 맛으로 보답하겠습니다." : "앞으로도 변함없는 맛으로 보답할게요.";
        }
        if (rating == 3) {
            return formal ? "다음 방문 때는 더 만족하실 수 있도록 준비하겠습니다." : "다음 방문 때는 더 만족하실 수 있도록 준비할게요.";
        }
        return formal ? "같은 일이 반복되지 않도록 더 세심하게 살피겠습니다." : "같은 일이 없도록 더 세심하게 살필게요.";
    }

    private static String endSentence(String s) {
        return s.matches(".*[.!?~…♡♥)]$") ? s : s + ".";
    }
}
