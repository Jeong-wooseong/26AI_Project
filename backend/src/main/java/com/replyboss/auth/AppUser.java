package com.replyboss.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/** 사장님 계정. 비밀번호는 BCrypt 해시만 저장한다. */
@Entity
@Table(name = "app_user")
public class AppUser {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 255)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 100)
    private String passwordHash;

    @Column(name = "email_verified", nullable = false)
    private boolean emailVerified;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Role role;

    @Column(name = "terms_agreed_at")
    private LocalDateTime termsAgreedAt;

    @Column(name = "privacy_agreed_at")
    private LocalDateTime privacyAgreedAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /** 사장님 이름 (계정 기능 초기에 가입한 계정은 없을 수 있음) */
    @Column(length = 30)
    private String name;

    /** 관리자가 이용을 중지한 시각. null 이면 이용 중 */
    @Column(name = "disabled_at")
    private LocalDateTime disabledAt;

    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    protected AppUser() {
    }

    public AppUser(String email, String passwordHash, Role role, LocalDateTime agreedAt) {
        this(email, null, passwordHash, role, agreedAt);
    }

    public AppUser(String email, String name, String passwordHash, Role role, LocalDateTime agreedAt) {
        this.email = email;
        this.name = name;
        this.passwordHash = passwordHash;
        this.role = role;
        this.termsAgreedAt = agreedAt;
        this.privacyAgreedAt = agreedAt;
    }

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
    }

    public void verifyEmail() {
        this.emailVerified = true;
    }

    public void changePassword(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public void recordLogin(LocalDateTime at) {
        this.lastLoginAt = at;
    }

    /** 관리자: 이용 중지(true) 또는 다시 이용(false) */
    public void setDisabled(boolean disabled, LocalDateTime at) {
        this.disabledAt = disabled ? at : null;
    }

    public boolean isDisabled() {
        return disabledAt != null;
    }

    public String getName() {
        return name;
    }

    public LocalDateTime getDisabledAt() {
        return disabledAt;
    }

    public LocalDateTime getLastLoginAt() {
        return lastLoginAt;
    }

    public Long getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public boolean isEmailVerified() {
        return emailVerified;
    }

    public Role getRole() {
        return role;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}
