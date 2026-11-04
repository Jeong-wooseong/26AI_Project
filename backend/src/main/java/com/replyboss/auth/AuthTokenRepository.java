package com.replyboss.auth;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface AuthTokenRepository extends JpaRepository<AuthToken, Long> {

    Optional<AuthToken> findByTokenHash(String tokenHash);

    /** 같은 목적의 이전 토큰을 쓸 수 없게 한다 (새 메일을 보내면 이전 링크는 무효) */
    @Modifying
    @Query("update AuthToken t set t.usedAt = CURRENT_TIMESTAMP where t.user.id = :userId and t.purpose = :purpose and t.usedAt is null")
    int invalidate(@Param("userId") Long userId, @Param("purpose") AuthToken.Purpose purpose);

    @Modifying
    @Query("delete from AuthToken t where t.user.id = :userId")
    int deleteByUserId(@Param("userId") Long userId);
}
