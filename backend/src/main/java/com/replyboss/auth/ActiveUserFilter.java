package com.replyboss.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * 로그인한 상태에서 관리자가 이용을 중지했거나 계정이 지워졌으면, 다음 요청부터 로그인을 풀어 401 이 되게 한다.
 * (빈으로 등록하지 않는다: 서블릿 필터로 한 번 더 등록되지 않게 SecurityConfig 에서만 만든다)
 */
public class ActiveUserFilter extends OncePerRequestFilter {

    private final AppUserRepository users;

    public ActiveUserFilter(AppUserRepository users) {
        this.users = users;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof AuthPrincipal p) {
            boolean active = users.findById(p.id()).map(u -> !u.isDisabled()).orElse(false);
            if (!active) {
                SecurityContextHolder.clearContext();
                HttpSession session = request.getSession(false);
                if (session != null) {
                    session.invalidate();
                }
            }
        }
        chain.doFilter(request, response);
    }
}
