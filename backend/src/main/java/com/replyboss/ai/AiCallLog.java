package com.replyboss.ai;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/** AI 호출 한 건의 결과 (관리자 서비스 모니터링용). 프롬프트·리뷰 본문 같은 내용은 남기지 않는다. */
@Entity
@Table(name = "ai_call_log", indexes = @Index(name = "idx_ai_call_log_created", columnList = "created_at"))
public class AiCallLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 어떤 작업의 호출인지 (요청 스키마 이름: review_classification, reply_drafts 등) */
    @Column(nullable = false, length = 50)
    private String kind;

    @Column(length = 60)
    private String model;

    @Column(nullable = false)
    private boolean success;

    @Column(name = "error_code", length = 40)
    private String errorCode;

    @Column(name = "error_message", length = 500)
    private String errorMessage;

    @Column(name = "duration_ms", nullable = false)
    private long durationMs;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    protected AiCallLog() {
    }

    public AiCallLog(String kind, String model, boolean success, String errorCode, String errorMessage, long durationMs,
                     LocalDateTime createdAt) {
        this.kind = kind;
        this.model = model;
        this.success = success;
        this.errorCode = errorCode;
        this.errorMessage = errorMessage == null ? null : errorMessage.substring(0, Math.min(500, errorMessage.length()));
        this.durationMs = durationMs;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public String getKind() { return kind; }
    public String getModel() { return model; }
    public boolean isSuccess() { return success; }
    public String getErrorCode() { return errorCode; }
    public String getErrorMessage() { return errorMessage; }
    public long getDurationMs() { return durationMs; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
