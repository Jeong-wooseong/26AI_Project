package com.replyboss.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 이메일 인증·비밀번호 재설정용 일회용 토큰. 원래 값은 메일로만 보내고 DB 에는 SHA-256 해시만 저장한다.
 */
@Entity
@Table(name = "auth_token")
public class AuthToken {

    public enum Purpose {
        VERIFY_EMAIL,
        RESET_PASSWORD
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private AppUser user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Purpose purpose;

    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "used_at")
    private LocalDateTime usedAt;

    protected AuthToken() {
    }

    public AuthToken(AppUser user, Purpose purpose, String tokenHash, LocalDateTime expiresAt) {
        this.user = user;
        this.purpose = purpose;
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
    }

    public boolean usable(Purpose expected, LocalDateTime now) {
        return purpose == expected && usedAt == null && now.isBefore(expiresAt);
    }

    public void markUsed(LocalDateTime now) {
        this.usedAt = now;
    }

    public AppUser getUser() {
        return user;
    }
}
