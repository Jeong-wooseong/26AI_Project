package com.replyboss.auth;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;

/** 로그인한 사장님 (세션·로그인 유지 쿠키에 공통으로 쓰는 주체) */
public record AuthPrincipal(Long id, String email, String name, String passwordHash, Role role, boolean verified, boolean active) implements UserDetails {

    public static AuthPrincipal of(AppUser user) {
        return new AuthPrincipal(user.getId(), user.getEmail(), user.getName(), user.getPasswordHash(), user.getRole(),
                user.isEmailVerified(), !user.isDisabled());
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return role == Role.ADMIN
                ? List.of(new SimpleGrantedAuthority("ROLE_USER"), new SimpleGrantedAuthority("ROLE_ADMIN"))
                : List.of(new SimpleGrantedAuthority("ROLE_USER"));
    }

    @Override
    public String getPassword() {
        return passwordHash;
    }

    @Override
    public String getUsername() {
        return email;
    }

    @Override
    public boolean isEnabled() {
        return verified && active; // 이용 중지된 계정은 로그인 유지 쿠키로도 들어오지 못한다
    }
}
