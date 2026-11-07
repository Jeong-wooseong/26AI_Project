package com.replyboss.reply;

import com.replyboss.common.AccessGuard;
import com.replyboss.common.ApiException;
import com.replyboss.common.JsonText;
import com.replyboss.review.ReviewDtos.ReplyResponse;
import com.replyboss.review.ReviewDtos.SelectReplyRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
public class ReplyController {

    private final ReplyRepository replyRepository;
    private final AccessGuard guard;

    public ReplyController(ReplyRepository replyRepository, AccessGuard guard) {
        this.replyRepository = replyRepository;
        this.guard = guard;
    }

    /** 답글 피드백: 'UP'(마음에 들어요) | 'DOWN'(개선하고 싶어요, 이유 선택) | null(취소) */
    public record FeedbackRequest(
            @Pattern(regexp = "UP|DOWN", message = "피드백 값이 올바르지 않습니다.") String value,
            List<FeedbackReason> reasons,
            @Size(max = 300, message = "의견은 300자 이내여야 합니다.") String comment
    ) {
    }

    @PutMapping("/api/replies/{replyId}/feedback")
    @Transactional
    public ReplyResponse feedback(@PathVariable Long replyId, @Valid @RequestBody FeedbackRequest request) {
        guard.requireReply(replyId);
        Reply reply = replyRepository.findById(replyId).orElseThrow(() -> ApiException.notFound("답글"));
        List<String> reasons = request.value() != null && request.value().equals("DOWN") && request.reasons() != null
                ? request.reasons().stream().distinct().map(Enum::name).toList()
                : List.of();
        String comment = request.comment() == null || request.comment().isBlank() ? null : request.comment().strip();
        reply.recordFeedback(request.value(), JsonText.write(reasons), "DOWN".equals(request.value()) ? comment : null);
        return ReplyResponse.from(reply);
    }

    /** 사장님이 복사한 답글을 기록한다 (수정했으면 수정본도). 이력·수정률 계산에 쓴다. */
    @PatchMapping("/api/replies/{replyId}/select")
    @Transactional
    public ReplyResponse select(@PathVariable Long replyId, @Valid @RequestBody(required = false) SelectReplyRequest request) {
        guard.requireReply(replyId);
        Reply reply = replyRepository.findById(replyId).orElseThrow(() -> ApiException.notFound("답글"));
        reply.select(request == null ? null : request.editedContent());
        return ReplyResponse.from(reply);
    }
}
