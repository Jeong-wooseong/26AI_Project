package com.replyboss.reply;

import com.replyboss.common.ApiException;
import com.replyboss.review.ReviewDtos.ReplyResponse;
import com.replyboss.review.ReviewDtos.SelectReplyRequest;
import jakarta.validation.Valid;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ReplyController {

    private final ReplyRepository replyRepository;

    public ReplyController(ReplyRepository replyRepository) {
        this.replyRepository = replyRepository;
    }

    /** 사장님이 복사한 답글을 기록한다 (수정했으면 수정본도). 이력·수정률 계산에 쓴다. */
    @PatchMapping("/api/replies/{replyId}/select")
    @Transactional
    public ReplyResponse select(@PathVariable Long replyId, @Valid @RequestBody(required = false) SelectReplyRequest request) {
        Reply reply = replyRepository.findById(replyId).orElseThrow(() -> ApiException.notFound("답글"));
        reply.select(request == null ? null : request.editedContent());
        return ReplyResponse.from(reply);
    }
}
