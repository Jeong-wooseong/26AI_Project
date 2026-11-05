package com.replyboss.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class AuthDtos {

    private AuthDtos() {
    }

    public record SignupRequest(
            @NotBlank(message = "이메일을 입력하십시오.") @Email(message = "이메일 형식이 올바르지 않습니다.") @Size(max = 255) String email,
            @NotBlank(message = "이름을 입력하십시오.") @Size(max = 30, message = "이름은 30자 이내여야 합니다.") String name,
            @NotBlank(message = "비밀번호를 입력하십시오.") @Size(max = 64, message = "비밀번호는 64자 이내여야 합니다.") String password,
            @NotBlank(message = "비밀번호 확인을 입력하십시오.") String passwordConfirm,
            boolean agreeTerms,
            boolean agreePrivacy
    ) {
    }

    public record LoginRequest(
            @NotBlank(message = "이메일을 입력하십시오.") String email,
            @NotBlank(message = "비밀번호를 입력하십시오.") String password,
            boolean remember
    ) {
    }

    public record EmailRequest(
            @NotBlank(message = "이메일을 입력하십시오.") @Email(message = "이메일 형식이 올바르지 않습니다.") String email
    ) {
    }

    public record TokenRequest(@NotBlank(message = "인증 정보가 없습니다.") String token) {
    }

    public record ResetConfirmRequest(
            @NotBlank(message = "인증 정보가 없습니다.") String token,
            @NotBlank(message = "새 비밀번호를 입력하십시오.") @Size(max = 64, message = "비밀번호는 64자 이내여야 합니다.") String password,
            @NotBlank(message = "비밀번호 확인을 입력하십시오.") String passwordConfirm
    ) {
    }

    public record DeleteAccountRequest(@NotBlank(message = "비밀번호를 입력하십시오.") String password) {
    }

    public record MeResponse(Long id, String email, String name, Role role) {
        public static MeResponse of(AuthPrincipal p) {
            return new MeResponse(p.id(), p.email(), p.name(), p.role());
        }
    }

    public record MessageResponse(String message) {
    }
}
