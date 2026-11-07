package com.replyboss.common;

import com.replyboss.auth.CurrentUser;
import com.replyboss.reply.ReplyRepository;
import com.replyboss.review.ReviewRepository;
import com.replyboss.store.StoreRepository;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * 사용자별 데이터 분리: 컨트롤러에서 매장·리뷰·답글이 지금 로그인한 사장님 것인지 확인한다.
 * 남의 데이터는 존재 여부도 알리지 않도록 '찾을 수 없음'으로 응답한다.
 */
@Component
public class AccessGuard {

    private final CurrentUser currentUser;
    private final StoreRepository stores;
    private final ReviewRepository reviews;
    private final ReplyRepository replies;

    public AccessGuard(CurrentUser currentUser, StoreRepository stores, ReviewRepository reviews, ReplyRepository replies) {
        this.currentUser = currentUser;
        this.stores = stores;
        this.reviews = reviews;
        this.replies = replies;
    }

    public void requireStore(Long storeId) {
        check(stores.findOwnerId(storeId), "매장");
    }

    public void requireReview(Long reviewId) {
        check(reviews.findOwnerId(reviewId), "리뷰");
    }

    public void requireReply(Long replyId) {
        check(replies.findOwnerId(replyId), "답글");
    }

    private void check(Optional<Long> ownerId, String what) {
        Long me = currentUser.id();
        if (ownerId.isEmpty() || !ownerId.get().equals(me)) {
            throw ApiException.notFound(what);
        }
    }
}
