package com.replyboss.common;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * application.yml 의 replyboss.* 설정.
 *
 * @param appUrl         메일 링크에 쓸 프론트엔드 주소 (예: http://localhost:5173)
 * @param rememberMeKey  '로그인 상태 유지' 쿠키 서명 키. 운영에서는 반드시 바꾼다 (.env 의 REMEMBER_ME_KEY)
 * @param secureCookies  HTTPS 로 서비스할 때 true (쿠키에 Secure 속성)
 * @param uploadDir      문의 첨부 이미지를 저장할 폴더
 * @param adminEmails    관리자 권한을 줄 이메일 (쉼표로 구분). 첫 가입자는 항상 관리자
 * @param mail           메일 발송(SMTP) 설정
 */
@ConfigurationProperties(prefix = "replyboss")
public record AppProperties(
        String appUrl,
        String rememberMeKey,
        boolean secureCookies,
        String uploadDir,
        String adminEmails,
        Mail mail
) {
    public record Mail(String host, int port, String username, String password, String from) {
        public boolean configured() {
            return host != null && !host.isBlank() && username != null && !username.isBlank()
                    && password != null && !password.isBlank();
        }
    }

    public boolean isAdminEmail(String email) {
        if (adminEmails == null || adminEmails.isBlank() || email == null) {
            return false;
        }
        for (String e : adminEmails.split(",")) {
            if (e.strip().equalsIgnoreCase(email.strip())) {
                return true;
            }
        }
        return false;
    }
}
