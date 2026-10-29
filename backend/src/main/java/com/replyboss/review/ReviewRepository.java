package com.replyboss.review;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

public interface ReviewRepository extends JpaRepository<Review, Long> {

    List<Review> findByStore_IdAndCreatedAtBetweenOrderByIdDesc(Long storeId, LocalDateTime from, LocalDateTime to);

    List<Review> findByStore_IdOrderByIdDesc(Long storeId);

    boolean existsByStore_IdAndPlatformAndMaskedContent(Long storeId, Platform platform, String maskedContent);

    /** 중복 방지 1단: 최근 기간의 임베딩이 있는 리뷰 */
    List<Review> findByStore_IdAndCreatedAtAfterAndEmbeddingIsNotNull(Long storeId, LocalDateTime after);

    /** 같은 묶음의 다른 리뷰 */
    List<Review> findByStore_IdAndGroupIdAndIdNot(Long storeId, String groupId, Long id);

    /** 묶음별 리뷰 수 [groupId, count] */
    @Query("select r.groupId, count(r) from Review r where r.store.id = :storeId and r.groupId in :groups group by r.groupId")
    List<Object[]> countByGroups(@Param("storeId") Long storeId, @Param("groups") Collection<String> groups);
}
