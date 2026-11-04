package com.replyboss.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.replyboss.common.AppProperties;
import com.replyboss.common.ErrorResponse;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.expression.WebExpressionAuthorizationManager;
import org.springframework.security.web.authentication.rememberme.TokenBasedRememberMeServices;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;

import java.io.IOException;

/**
 * 로그인 방식: 세션 쿠키(HttpOnly) + 선택 시 '로그인 상태 유지' 쿠키(14일, 서명).
 * CSRF: 쿠키(XSRF-TOKEN)에 담긴 토큰을 프론트엔드가 X-XSRF-TOKEN 헤더로 돌려보낸다.
 * /api/** 는 로그인이 필요하고 /api/admin/** 은 관리자만. 측정용 /api/eval/** 은 같은 PC(localhost)에서만.
 */
@Configuration
public class SecurityConfig {

    private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);
    static final String DEFAULT_REMEMBER_KEY = "replyboss-dev-remember-me-key-change-me";

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    TokenBasedRememberMeServices rememberMeServices(AppProperties props, AuthUserDetailsService users) {
        String key = props.rememberMeKey() == null || props.rememberMeKey().isBlank() ? DEFAULT_REMEMBER_KEY : props.rememberMeKey();
        if (DEFAULT_REMEMBER_KEY.equals(key)) {
            log.warn("REMEMBER_ME_KEY 가 기본값입니다. 실제 서비스에서는 backend/.env 에 임의의 긴 값을 넣으십시오.");
        }
        TokenBasedRememberMeServices services = new TokenBasedRememberMeServices(key, users);
        services.setAlwaysRemember(true); // 로그인 요청에서 '로그인 상태 유지'를 골랐을 때만 컨트롤러가 호출한다
        services.setTokenValiditySeconds(14 * 24 * 60 * 60);
        services.setUseSecureCookie(props.secureCookies());
        return services;
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, TokenBasedRememberMeServices rememberMe,
                                            SecurityContextRepository contextRepository, ObjectMapper mapper) throws Exception {
        CookieCsrfTokenRepository csrfRepository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrfRepository.setCookieCustomizer(c -> c.sameSite("Lax").secure(false));
        CsrfTokenRequestAttributeHandler csrfHandler = new CsrfTokenRequestAttributeHandler();
        csrfHandler.setCsrfRequestAttributeName(null); // 매 요청 토큰을 읽어 쿠키를 항상 내려준다 (SPA)

        http
                .csrf(c -> c.csrfTokenRepository(csrfRepository).csrfTokenRequestHandler(csrfHandler)
                        .ignoringRequestMatchers("/api/eval/**", "/h2-console/**"))
                .headers(h -> h.frameOptions(f -> f.sameOrigin()))
                .securityContext(s -> s.securityContextRepository(contextRepository))
                .authorizeHttpRequests(a -> a
                        .requestMatchers("/api/auth/signup", "/api/auth/login", "/api/auth/me", "/api/auth/verify",
                                "/api/auth/resend-verification", "/api/auth/password-reset/**").permitAll()
                        .requestMatchers("/api/eval/**")
                        .access(new WebExpressionAuthorizationManager("hasIpAddress('127.0.0.1') or hasIpAddress('::1')"))
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .requestMatchers("/api/**").authenticated()
                        .anyRequest().permitAll())
                .rememberMe(r -> r.rememberMeServices(rememberMe))
                .logout(l -> l.logoutUrl("/api/auth/logout")
                        .logoutSuccessHandler((req, res, auth) -> res.setStatus(HttpServletResponse.SC_NO_CONTENT)))
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .exceptionHandling(e -> e
                        .authenticationEntryPoint((req, res, ex) ->
                                write(res, mapper, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "로그인이 필요합니다."))
                        .accessDeniedHandler((req, res, ex) -> {
                            if (ex instanceof CsrfException) {
                                write(res, mapper, HttpStatus.FORBIDDEN, "CSRF",
                                        "보안 토큰이 없거나 만료되었습니다. 페이지를 새로고침한 뒤 다시 시도하십시오.");
                            } else {
                                write(res, mapper, HttpStatus.FORBIDDEN, "FORBIDDEN", "이 기능을 사용할 권한이 없습니다.");
                            }
                        }));
        return http.build();
    }

    private static void write(HttpServletResponse res, ObjectMapper mapper, HttpStatus status, String code, String message)
            throws IOException {
        res.setStatus(status.value());
        res.setContentType(MediaType.APPLICATION_JSON_VALUE);
        res.setCharacterEncoding("UTF-8");
        mapper.writeValue(res.getWriter(), new ErrorResponse(code, message));
    }
}
