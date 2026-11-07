package com.replyboss.admin;

import com.replyboss.common.JsonText;
import com.replyboss.reply.Reply;
import com.replyboss.reply.ReplyRepository;
import com.replyboss.support.Inquiry;
import com.replyboss.support.InquiryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.replyboss.review.Review;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 관리자 통계: 문의 현황과 답글 피드백 */
@Service
public class AdminService {

    public record Stats(
            int inquiries,
            int lastSevenDays,
            Map<String, Integer> byStatus,
            Map<String, Integer> byType,
            Map<String, Integer> byLocation,
            int feedbackUp,
            int feedbackDown,
            Map<String, Integer> downReasons,
            Map<String, Integer> downByTone
    ) {
    }

    private final InquiryRepository inquiries;
    private final ReplyRepository replies;

    public AdminService(InquiryRepository inquiries, ReplyRepository replies) {
        this.inquiries = inquiries;
        this.replies = replies;
    }

    @Transactional(readOnly = true)
    public Stats stats() {
        List<Inquiry> all = inquiries.findAllByOrderByIdDesc();
        LocalDateTime weekAgo = LocalDateTime.now().minusDays(7);
        Map<String, Integer> byStatus = new LinkedHashMap<>();
        Map<String, Integer> byType = new LinkedHashMap<>();
        Map<String, Integer> byLocation = new LinkedHashMap<>();
        int recent = 0;
        for (Inquiry i : all) {
            byStatus.merge(i.getStatus().name(), 1, Integer::sum);
            byType.merge(i.getType().name(), 1, Integer::sum);
            byLocation.merge(i.getLocation() == null ? "미지정" : i.getLocation(), 1, Integer::sum);
            if (i.getCreatedAt().isAfter(weekAgo)) {
                recent++;
            }
        }
        int up = 0;
        int down = 0;
        Map<String, Integer> reasons = new LinkedHashMap<>();
        Map<String, Integer> byTone = new LinkedHashMap<>();
        for (Reply r : replies.findByFeedbackIsNotNull()) {
            if ("UP".equals(r.getFeedback())) {
                up++;
            } else if ("DOWN".equals(r.getFeedback())) {
                down++;
                byTone.merge(r.getTone().name(), 1, Integer::sum);
                JsonText.readStringList(r.getFeedbackReasons()).forEach(x -> reasons.merge(x, 1, Integer::sum));
            }
        }
        return new Stats(all.size(), recent, byStatus, byType, byLocation, up, down, reasons, byTone);
    }

    /**
     * 답글 피드백 한 건. 리뷰는 개인정보를 가린 본문만, 답글은 사장님이 본 최종 문장(수정본이 있으면 수정본).
     * @param isFinal 사장님이 최종 답글로 확정한 답글인지
     * @param edited  사장님이 직접 고친 답글인지
     */
    public record FeedbackRow(Long replyId, String value, List<String> reasons, String comment, String tone,
                              String replyText, boolean isFinal, boolean edited,
                              Long reviewId, int rating, String reviewType, String reviewText,
                              String storeName, String ownerEmail, LocalDateTime feedbackAt) {
    }

    /** 답글 피드백 목록 (최신순). value: UP | DOWN | null(전체), reason: 개선 이유 코드 하나로 거르기 */
    @Transactional(readOnly = true)
    public List<FeedbackRow> feedback(String value, String reason, int limit) {
        return replies.findByFeedbackIsNotNull().stream()
                .filter(r -> value == null || value.isBlank() || value.equals(r.getFeedback()))
                .filter(r -> reason == null || reason.isBlank() || JsonText.readStringList(r.getFeedbackReasons()).contains(reason))
                .sorted(Comparator.comparing(Reply::getFeedbackAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(Math.max(1, Math.min(limit, 200)))
                .map(r -> {
                    Review rv = r.getReview();
                    var store = rv.getStore();
                    return new FeedbackRow(r.getId(), r.getFeedback(), JsonText.readStringList(r.getFeedbackReasons()),
                            r.getFeedbackComment(), r.getTone().name(), r.getText(),
                            r.getId().equals(rv.getFinalReplyId()), r.getEditedContent() != null,
                            rv.getId(), rv.getRating(), rv.getType() == null ? null : rv.getType().name(), rv.getMaskedContent(),
                            store.getName(), store.getOwner() == null ? null : store.getOwner().getEmail(), r.getFeedbackAt());
                })
                .toList();
    }
}
