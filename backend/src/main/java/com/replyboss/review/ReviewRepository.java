package com.replyboss.review;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
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

    /** 주간 리포트: 기간 안의 리뷰. 날짜는 고객 작성일이 있으면 작성일, 없으면 등록일 기준 */
    @Query("select r from Review r where r.store.id = :storeId and ("
            + "(r.writtenOn is not null and r.writtenOn >= :from and r.writtenOn < :to)"
            + " or (r.writtenOn is null and r.createdAt >= :fromTs and r.createdAt < :toTs))")
    List<Review> findInPeriod(@Param("storeId") Long storeId, @Param("from") LocalDate from, @Param("to") LocalDate to,
                              @Param("fromTs") LocalDateTime fromTs, @Param("toTs") LocalDateTime toTs);

    /** 묶음별 리뷰 수 [groupId, count] */
    @Query("select r.groupId, count(r) from Review r where r.store.id = :storeId and r.groupId in :groups group by r.groupId")
    List<Object[]> countByGroups(@Param("storeId") Long storeId, @Param("groups") Collection<String> groups);
}
