package com.replyboss.admin;

import com.replyboss.common.JsonText;
import com.replyboss.reply.Reply;
import com.replyboss.reply.ReplyRepository;
import com.replyboss.support.Inquiry;
import com.replyboss.support.InquiryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
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
}
