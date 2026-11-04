package com.replyboss.auth;

import com.replyboss.auth.AuthDtos.DeleteAccountRequest;
import com.replyboss.auth.AuthDtos.EmailRequest;
import com.replyboss.auth.AuthDtos.LoginRequest;
import com.replyboss.auth.AuthDtos.MeResponse;
import com.replyboss.auth.AuthDtos.MessageResponse;
import com.replyboss.auth.AuthDtos.ResetConfirmRequest;
import com.replyboss.auth.AuthDtos.SignupRequest;
import com.replyboss.auth.AuthDtos.TokenRequest;
import com.replyboss.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.security.web.authentication.rememberme.TokenBasedRememberMeServices;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final CurrentUser currentUser;
    private final SecurityContextRepository contextRepository;
    private final TokenBasedRememberMeServices rememberMe;

    public AuthController(AuthService authService, CurrentUser currentUser, SecurityContextRepository contextRepository,
                          TokenBasedRememberMeServices rememberMe) {
        this.authService = authService;
        this.currentUser = currentUser;
        this.contextRepository = contextRepository;
        this.rememberMe = rememberMe;
    }

    @PostMapping("/signup")
    @ResponseStatus(HttpStatus.CREATED)
    public MessageResponse signup(@Valid @RequestBody SignupRequest request) {
        String email = authService.signup(request);
        return new MessageResponse(email + " 으로 인증 메일을 보냈습니다. 메일의 링크를 눌러 인증을 마친 뒤 로그인하십시오.");
    }

    @PostMapping("/verify")
    public MessageResponse verify(@Valid @RequestBody TokenRequest request) {
        authService.verifyEmail(request.token());
        return new MessageResponse("이메일 인증이 끝났습니다. 로그인하십시오.");
    }

    @PostMapping("/resend-verification")
    public MessageResponse resend(@Valid @RequestBody EmailRequest request) {
        authService.resendVerification(request.email());
        return new MessageResponse("인증이 필요한 계정이면 인증 메일을 다시 보냈습니다. 메일함(스팸함 포함)을 확인하십시오.");
    }

    @PostMapping("/login")
    public MeResponse login(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest,
                            HttpServletResponse httpResponse) {
        AuthPrincipal principal = authService.authenticate(request.email(), request.password());
        UsernamePasswordAuthenticationToken auth =
                UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.getAuthorities());
        // 세션 고정 공격 방지: 로그인 때 세션 ID 를 바꾼다
        if (httpRequest.getSession(false) != null) {
            httpRequest.changeSessionId();
        }
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(auth);
        SecurityContextHolder.setContext(context);
        contextRepository.saveContext(context, httpRequest, httpResponse);
        if (request.remember()) {
            rememberMe.loginSuccess(httpRequest, httpResponse, auth);
        }
        return MeResponse.of(principal);
    }

    /** 로그인하지 않았으면 401 (프론트엔드는 이 응답으로 로그인 화면을 보여준다) */
    @GetMapping("/me")
    public MeResponse me() {
        return MeResponse.of(currentUser.get().orElseThrow(() ->
                new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "로그인이 필요합니다.")));
    }

    @PostMapping("/password-reset/request")
    public MessageResponse requestReset(@Valid @RequestBody EmailRequest request) {
        authService.requestPasswordReset(request.email());
        return new MessageResponse("가입된 이메일이면 비밀번호 재설정 링크를 보냈습니다. 메일함(스팸함 포함)을 확인하십시오.");
    }

    @PostMapping("/password-reset/confirm")
    public MessageResponse confirmReset(@Valid @RequestBody ResetConfirmRequest request) {
        authService.resetPassword(request.token(), request.password(), request.passwordConfirm());
        return new MessageResponse("비밀번호를 바꿨습니다. 새 비밀번호로 로그인하십시오.");
    }

    @DeleteMapping("/account")
    public MessageResponse deleteAccount(@Valid @RequestBody DeleteAccountRequest request, HttpServletRequest httpRequest,
                                         HttpServletResponse httpResponse) {
        authService.deleteAccount(currentUser.id(), request.password());
        rememberMe.logout(httpRequest, httpResponse, SecurityContextHolder.getContext().getAuthentication());
        new SecurityContextLogoutHandler().logout(httpRequest, httpResponse, SecurityContextHolder.getContext().getAuthentication());
        return new MessageResponse("계정과 모든 데이터를 삭제했습니다.");
    }
}
