package com.replyboss.auth;

import com.replyboss.auth.AuthDtos.SignupRequest;
import com.replyboss.common.ApiException;
import com.replyboss.common.AppProperties;
import com.replyboss.store.StoreRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;

/**
 * 회원가입·이메일 인증·로그인 확인·비밀번호 재설정·계정 탈퇴.
 * 첫 가입자는 관리자가 되고, 계정이 없던 시절의 매장 데이터를 이어받는다.
 */
@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);
    static final Duration VERIFY_TTL = Duration.ofHours(24);
    static final Duration RESET_TTL = Duration.ofMinutes(30);

    private final AppUserRepository users;
    private final AuthTokenRepository tokens;
    private final StoreRepository stores;
    private final PasswordEncoder encoder;
    private final MailService mail;
    private final LoginAttempts attempts;
    private final AccountDataCleaner cleaner;
    private final AppProperties props;
    private final SecureRandom random = new SecureRandom();

    public AuthService(AppUserRepository users, AuthTokenRepository tokens, StoreRepository stores, PasswordEncoder encoder,
                       MailService mail, LoginAttempts attempts, AccountDataCleaner cleaner, AppProperties props) {
        this.users = users;
        this.tokens = tokens;
        this.stores = stores;
        this.encoder = encoder;
        this.mail = mail;
        this.attempts = attempts;
        this.cleaner = cleaner;
        this.props = props;
    }

    static String normalize(String email) {
        return email == null ? "" : email.strip().toLowerCase(Locale.ROOT);
    }

    /** 8자 이상, 영문과 숫자를 모두 포함 */
    static void checkPassword(String password, String confirm) {
        if (!password.equals(confirm)) {
            throw ApiException.badRequest("PASSWORD_MISMATCH", "비밀번호 확인이 일치하지 않습니다.");
        }
        if (password.length() < 8 || !password.matches(".*[A-Za-z].*") || !password.matches(".*\\d.*")) {
            throw ApiException.badRequest("WEAK_PASSWORD", "비밀번호는 8자 이상이며 영문과 숫자를 모두 포함해야 합니다.");
        }
    }

    @Transactional
    public String signup(SignupRequest r) {
        if (!r.agreeTerms() || !r.agreePrivacy()) {
            throw ApiException.badRequest("AGREEMENT_REQUIRED", "이용약관과 개인정보 처리방침에 동의해야 가입할 수 있습니다.");
        }
        checkPassword(r.password(), r.passwordConfirm());
        String email = normalize(r.email());
        if (users.existsByEmail(email)) {
            throw new ApiException(HttpStatus.CONFLICT, "EMAIL_TAKEN",
                    "이미 가입된 이메일입니다. 인증 메일을 받지 못했다면 로그인 화면에서 다시 보낼 수 있습니다.");
        }
        mail.requireConfigured();
        boolean first = users.count() == 0;
        Role role = first || props.isAdminEmail(email) ? Role.ADMIN : Role.USER;
        AppUser user = users.save(new AppUser(email, encoder.encode(r.password()), role, LocalDateTime.now()));
        if (first) {
            // 계정 기능이 생기기 전에 만든 매장·리뷰·답글은 첫 가입자에게 넘긴다
            stores.findByOwnerIsNull().forEach(s -> s.assignOwner(user));
        }
        sendVerification(user); // 실패하면 예외로 가입 자체를 되돌린다
        return email;
    }

    @Transactional
    public void verifyEmail(String token) {
        AuthToken t = use(token, AuthToken.Purpose.VERIFY_EMAIL,
                "인증 링크가 올바르지 않거나 만료되었습니다. 로그인 화면에서 인증 메일을 다시 받으십시오.");
        t.getUser().verifyEmail();
    }

    /** 가입 여부를 알려주지 않도록 결과와 상관없이 같은 응답을 준다 */
    @Transactional
    public void resendVerification(String email) {
        mail.requireConfigured();
        users.findByEmail(normalize(email)).filter(u -> !u.isEmailVerified()).ifPresent(this::sendVerification);
    }

    /** 로그인 확인. 성공하면 주체를 돌려준다 (세션 저장은 컨트롤러가 한다) */
    @Transactional(readOnly = true)
    public AuthPrincipal authenticate(String rawEmail, String password) {
        String email = normalize(rawEmail);
        if (attempts.isLocked(email)) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "LOGIN_LOCKED",
                    "비밀번호를 여러 번 틀려 10분 동안 로그인할 수 없습니다. 잠시 후 다시 시도하거나 비밀번호를 재설정하십시오.");
        }
        AppUser user = users.findByEmail(email).orElse(null);
        if (user == null || !encoder.matches(password, user.getPasswordHash())) {
            attempts.fail(email);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "BAD_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다.");
        }
        if (!user.isEmailVerified()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "EMAIL_NOT_VERIFIED",
                    "이메일 인증을 마쳐야 로그인할 수 있습니다. 받은 메일의 인증 링크를 눌러 주십시오.");
        }
        attempts.succeed(email);
        return AuthPrincipal.of(user);
    }

    @Transactional
    public void requestPasswordReset(String email) {
        mail.requireConfigured();
        users.findByEmail(normalize(email)).ifPresent(user -> {
            String token = issue(user, AuthToken.Purpose.RESET_PASSWORD, RESET_TTL);
            mail.send(user.getEmail(), "[ReplyBoss] 비밀번호 재설정",
                    """
                    ReplyBoss 비밀번호 재설정을 요청하셨습니다.
                    아래 링크에서 새 비밀번호를 설정하십시오. 링크는 30분 동안 한 번만 쓸 수 있습니다.

                    %s

                    직접 요청하지 않았다면 이 메일은 무시하셔도 됩니다. 비밀번호는 바뀌지 않습니다.
                    """.formatted(link("reset", token)));
        });
    }

    @Transactional
    public void resetPassword(String token, String password, String confirm) {
        checkPassword(password, confirm);
        AuthToken t = use(token, AuthToken.Purpose.RESET_PASSWORD,
                "재설정 링크가 올바르지 않거나 만료되었습니다. 비밀번호 찾기를 다시 진행하십시오.");
        AppUser user = t.getUser();
        user.changePassword(encoder.encode(password));
        user.verifyEmail(); // 메일함에 접근할 수 있음을 확인했으므로
        attempts.succeed(user.getEmail());
    }

    /** 계정 탈퇴: 비밀번호를 확인한 뒤 매장·리뷰·답글·리포트·문의·첨부 파일과 계정을 모두 지운다 */
    @Transactional
    public void deleteAccount(Long userId, String password) {
        AppUser user = users.findById(userId).orElseThrow(() -> ApiException.notFound("계정"));
        if (!encoder.matches(password, user.getPasswordHash())) {
            throw ApiException.badRequest("BAD_CREDENTIALS", "비밀번호가 올바르지 않습니다.");
        }
        cleaner.deleteAllOf(userId);
        tokens.deleteByUserId(userId);
        users.delete(user);
        log.info("계정 탈퇴: user {}", userId);
    }

    private void sendVerification(AppUser user) {
        String token = issue(user, AuthToken.Purpose.VERIFY_EMAIL, VERIFY_TTL);
        mail.send(user.getEmail(), "[ReplyBoss] 이메일 인증",
                """
                ReplyBoss에 가입해 주셔서 감사합니다.
                아래 링크를 눌러 이메일 인증을 마치면 로그인할 수 있습니다. 링크는 24시간 동안 유효합니다.

                %s

                직접 가입하지 않았다면 이 메일은 무시하셔도 됩니다.
                """.formatted(link("verify", token)));
    }

    private String issue(AppUser user, AuthToken.Purpose purpose, Duration ttl) {
        tokens.invalidate(user.getId(), purpose);
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        tokens.save(new AuthToken(user, purpose, hash(token), LocalDateTime.now().plus(ttl)));
        return token;
    }

    private AuthToken use(String token, AuthToken.Purpose purpose, String invalidMessage) {
        LocalDateTime now = LocalDateTime.now();
        AuthToken t = tokens.findByTokenHash(hash(token == null ? "" : token.strip()))
                .filter(x -> x.usable(purpose, now))
                .orElseThrow(() -> ApiException.badRequest("INVALID_TOKEN", invalidMessage));
        t.markUsed(now);
        return t;
    }

    private String link(String page, String token) {
        String base = props.appUrl() == null || props.appUrl().isBlank() ? "http://localhost:5173" : props.appUrl().strip();
        return base.replaceAll("/+$", "") + "/#" + page + "?token=" + token;
    }

    static String hash(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
