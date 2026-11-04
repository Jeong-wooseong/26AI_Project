package com.replyboss.support;

import com.replyboss.auth.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/** 고객 지원 문의 (일반 문의·오류 제보·개선 제안) */
@Entity
@Table(name = "inquiry")
public class Inquiry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private AppUser user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private InquiryType type;

    @Column(nullable = false, length = 100)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    /** 사용자가 고른 발생 위치 (예: 답글 생성) */
    @Column(length = 30)
    private String location;

    /** 자동 기록: 문의를 연 화면 경로와 마지막 오류 코드 */
    @Column(name = "page_path", length = 200)
    private String pagePath;

    @Column(name = "error_code", length = 50)
    private String errorCode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private InquiryStatus status;

    @Column(columnDefinition = "TEXT")
    private String answer;

    @Column(name = "answered_at")
    private LocalDateTime answeredAt;

    @Column(name = "attachment_name", length = 255)
    private String attachmentName;

    @Column(name = "attachment_path", length = 255)
    private String attachmentPath;

    @Column(name = "attachment_type", length = 50)
    private String attachmentType;

    @Column(name = "attachment_size")
    private Long attachmentSize;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    protected Inquiry() {
    }

    public Inquiry(AppUser user, InquiryType type, String title, String content, String location,
                   String pagePath, String errorCode) {
        this.user = user;
        this.type = type;
        this.title = title;
        this.content = content;
        this.location = location;
        this.pagePath = pagePath;
        this.errorCode = errorCode;
        this.status = InquiryStatus.RECEIVED;
    }

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public void attach(AttachmentStorage.Stored stored) {
        this.attachmentName = stored.originalName();
        this.attachmentPath = stored.path();
        this.attachmentType = stored.contentType();
        this.attachmentSize = stored.size();
    }

    /** 관리자 처리: 상태 변경과 답변. 답변을 쓰면 답변 완료로 바뀐다 */
    public void handle(InquiryStatus status, String answer, LocalDateTime now) {
        if (answer != null && !answer.isBlank()) {
            boolean changed = !answer.strip().equals(this.answer);
            this.answer = answer.strip();
            if (changed) {
                this.answeredAt = now;
            }
            this.status = InquiryStatus.ANSWERED;
        }
        if (status != null && (answer == null || answer.isBlank())) {
            this.status = status;
        }
    }

    public Long getId() {
        return id;
    }

    public AppUser getUser() {
        return user;
    }

    public InquiryType getType() {
        return type;
    }

    public String getTitle() {
        return title;
    }

    public String getContent() {
        return content;
    }

    public String getLocation() {
        return location;
    }

    public String getPagePath() {
        return pagePath;
    }

    public String getErrorCode() {
        return errorCode;
    }

    public InquiryStatus getStatus() {
        return status;
    }

    public String getAnswer() {
        return answer;
    }

    public LocalDateTime getAnsweredAt() {
        return answeredAt;
    }

    public String getAttachmentName() {
        return attachmentName;
    }

    public String getAttachmentPath() {
        return attachmentPath;
    }

    public String getAttachmentType() {
        return attachmentType;
    }

    public Long getAttachmentSize() {
        return attachmentSize;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}
