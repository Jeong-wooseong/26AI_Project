package com.replyboss.auth;

import com.replyboss.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.Optional;

/** 지금 요청을 보낸 사장님 */
@Component
public class CurrentUser {

    public Optional<AuthPrincipal> get() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getPrincipal() instanceof AuthPrincipal p ? Optional.of(p) : Optional.empty();
    }

    public AuthPrincipal require() {
        return get().orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "로그인이 필요합니다."));
    }

    public Long id() {
        return require().id();
    }

    public boolean isAdmin() {
        return get().map(p -> p.role() == Role.ADMIN).orElse(false);
    }
}
