package com.replyboss.store;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface StoreRepository extends JpaRepository<Store, Long> {

    List<Store> findByOwnerIsNull();

    List<Store> findByOwner_IdOrderByIdAsc(Long ownerId);

    /** 탈퇴 정리용: 엔티티를 불러오지 않고 id 만 (불러오면 삭제한 계정을 참조한 채 남는다) */
    @Query("select s.id from Store s where s.owner.id = :ownerId")
    List<Long> findIdsByOwnerId(@Param("ownerId") Long ownerId);

    /** 매장 주인 계정 ID (매장이 없거나 주인이 없으면 비어 있음) */
    @Query("select o.id from Store s join s.owner o where s.id = :storeId")
    Optional<Long> findOwnerId(@Param("storeId") Long storeId);

    @Modifying
    @Query("delete from Store s where s.id in :ids")
    int deleteByIds(@Param("ids") Collection<Long> ids);
}
