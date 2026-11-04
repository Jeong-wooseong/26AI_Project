package com.replyboss.auth;

import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

/** '로그인 상태 유지' 쿠키로 다시 로그인할 때 계정을 읽는다 */
@Service
public class AuthUserDetailsService implements UserDetailsService {

    private final AppUserRepository users;

    public AuthUserDetailsService(AppUserRepository users) {
        this.users = users;
    }

    @Override
    public UserDetails loadUserByUsername(String email) {
        return users.findByEmail(email).map(AuthPrincipal::of)
                .orElseThrow(() -> new UsernameNotFoundException("계정 없음"));
    }
}
