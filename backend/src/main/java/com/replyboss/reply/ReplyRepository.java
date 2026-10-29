package com.replyboss.reply;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface ReplyRepository extends JpaRepository<Reply, Long> {

    List<Reply> findByReview_IdInOrderByIdAsc(Collection<Long> reviewIds);

    List<Reply> findByReview_IdAndToneIn(Long reviewId, Collection<ReplyTone> tones);

    /** 이 가게에서 최근 최종 확정한 답글 (새 초안이 시작·마무리 표현을 반복하지 않게 참고용으로 넘긴다) */
    @Query("select r from Reply r join r.review v where v.store.id = :storeId and v.finalReplyId = r.id"
            + " and v.id <> :excludeReviewId order by v.finalUpdatedAt desc")
    List<Reply> findRecentFinals(@Param("storeId") Long storeId, @Param("excludeReviewId") Long excludeReviewId,
                                 Pageable pageable);

    /** 이 가게에서 최근에 쓴 템플릿 ID (같은 템플릿이 연달아 나오지 않게 하려고 사용) */
    @Query("select r.template.id from Reply r where r.review.store.id = :storeId and r.template is not null order by r.id desc")
    List<Long> findRecentTemplateIds(@Param("storeId") Long storeId, Pageable pageable);
}
