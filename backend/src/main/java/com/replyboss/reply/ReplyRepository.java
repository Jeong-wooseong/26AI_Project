package com.replyboss.reply;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface ReplyRepository extends JpaRepository<Reply, Long> {

    List<Reply> findByReview_IdInOrderByIdAsc(Collection<Long> reviewIds);

    List<Reply> findByReview_IdAndToneInAndSelectedFalse(Long reviewId, Collection<ReplyTone> tones);

    /** 이 가게에서 최근에 쓴 템플릿 ID (같은 템플릿이 연달아 나오지 않게 하려고 사용) */
    @Query("select r.template.id from Reply r where r.review.store.id = :storeId and r.template is not null order by r.id desc")
    List<Long> findRecentTemplateIds(@Param("storeId") Long storeId, Pageable pageable);
}
