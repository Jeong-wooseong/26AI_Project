package com.replyboss.auth;

import com.replyboss.common.ApiException;
import com.replyboss.common.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.stereotype.Service;

import java.util.Properties;

/**
 * SMTP 로 메일을 보낸다. 계정 정보는 backend/.env 의 MAIL_* 값으로만 받는다 (저장소에 넣지 않음).
 * Gmail 이면 2단계 인증을 켜고 '앱 비밀번호'를 만들어 MAIL_PASSWORD 에 넣는다.
 */
@Service
public class MailService {

    private static final Logger log = LoggerFactory.getLogger(MailService.class);

    private final AppProperties.Mail settings;
    private JavaMailSenderImpl sender;

    public MailService(AppProperties props) {
        this.settings = props.mail();
    }

    public boolean isConfigured() {
        return settings != null && settings.configured();
    }

    /** 설정이 없으면 보내기 전에 막는다 (가입은 했는데 메일이 안 오는 상황을 만들지 않기 위해) */
    public void requireConfigured() {
        if (!isConfigured()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "MAIL_NOT_CONFIGURED",
                    "메일 발송 설정이 없어 인증 메일을 보낼 수 없습니다. backend/.env 의 MAIL_HOST, MAIL_USERNAME, MAIL_PASSWORD 를 확인하십시오.");
        }
    }

    public void send(String to, String subject, String text) {
        requireConfigured();
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(settings.from() == null || settings.from().isBlank() ? settings.username() : settings.from());
        message.setTo(to);
        message.setSubject(subject);
        message.setText(text);
        try {
            sender().send(message);
        } catch (MailException e) {
            log.warn("메일 발송 실패 ({}): {}", to, e.getMessage());
            throw new ApiException(HttpStatus.BAD_GATEWAY, "MAIL_FAILED",
                    "메일을 보내지 못했습니다. 메일 설정(앱 비밀번호 등)을 확인한 뒤 다시 시도하십시오.");
        }
    }

    private synchronized JavaMailSenderImpl sender() {
        if (sender == null) {
            JavaMailSenderImpl s = new JavaMailSenderImpl();
            s.setHost(settings.host());
            s.setPort(settings.port() > 0 ? settings.port() : 587);
            s.setUsername(settings.username());
            s.setPassword(settings.password());
            s.setDefaultEncoding("UTF-8");
            Properties p = s.getJavaMailProperties();
            p.put("mail.smtp.auth", "true");
            p.put("mail.smtp.starttls.enable", "true");
            p.put("mail.smtp.connectiontimeout", "10000");
            p.put("mail.smtp.timeout", "10000");
            p.put("mail.smtp.writetimeout", "10000");
            sender = s;
        }
        return sender;
    }
}
