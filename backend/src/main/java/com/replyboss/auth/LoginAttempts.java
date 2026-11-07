package com.replyboss.auth;

import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** 같은 이메일로 비밀번호를 5번 틀리면 10분 동안 로그인을 막는다 (서버 메모리 기준) */
@Component
public class LoginAttempts {

    static final int MAX_FAILURES = 5;
    static final Duration LOCK = Duration.ofMinutes(10);

    private record State(int failures, Instant lockedUntil) {
    }

    private final Map<String, State> states = new ConcurrentHashMap<>();

    public boolean isLocked(String email) {
        State s = states.get(key(email));
        return s != null && s.lockedUntil() != null && Instant.now().isBefore(s.lockedUntil());
    }

    public void fail(String email) {
        states.compute(key(email), (k, s) -> {
            int failures = (s == null || (s.lockedUntil() != null && Instant.now().isAfter(s.lockedUntil()))) ? 1 : s.failures() + 1;
            return new State(failures, failures >= MAX_FAILURES ? Instant.now().plus(LOCK) : null);
        });
    }

    public void succeed(String email) {
        states.remove(key(email));
    }

    private static String key(String email) {
        return email == null ? "" : email.strip().toLowerCase(Locale.ROOT);
    }
}
