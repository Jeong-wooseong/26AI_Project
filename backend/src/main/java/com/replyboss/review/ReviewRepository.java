package com.replyboss.review;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

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

    /** 리뷰가 속한 매장의 주인 계정 ID */
    @Query("select o.id from Review r join r.store s join s.owner o where r.id = :reviewId")
    Optional<Long> findOwnerId(@Param("reviewId") Long reviewId);

    @Modifying
    @Query("delete from Review r where r.store.id in :storeIds")
    int deleteByStoreIds(@Param("storeIds") Collection<Long> storeIds);

    /** 관리자: 기간 안에 등록된 리뷰 [등록 시각, 매장 주인 ID] */
    @Query("select r.createdAt, o.id from Review r join r.store s left join s.owner o where r.createdAt >= :from")
    List<Object[]> findCreatedSince(@Param("from") LocalDateTime from);

    /** 관리자: 기간 안에 작성 완료된 리뷰 수 */
    long countByCompletedAtAfter(LocalDateTime after);

    /** 관리자: 회원별 리뷰 수 [주인 ID, 리뷰 수] */
    @Query("select o.id, count(r) from Review r join r.store s join s.owner o group by o.id")
    List<Object[]> countByOwner();

    /** 관리자: 매장별 리뷰 수와 작성 완료 수 [매장 ID, 리뷰 수, 작성 완료 수] */
    @Query("select s.id, count(r), sum(case when r.completedAt is not null then 1 else 0 end) from Review r join r.store s"
            + " where s.owner.id = :ownerId group by s.id")
    List<Object[]> countByStoreOf(@Param("ownerId") Long ownerId);

    /** 묶음별 리뷰 수 [groupId, count] */
    @Query("select r.groupId, count(r) from Review r where r.store.id = :storeId and r.groupId in :groups group by r.groupId")
    List<Object[]> countByGroups(@Param("storeId") Long storeId, @Param("groups") Collection<String> groups);
}
