package com.replyboss.review;

import com.replyboss.common.JsonText;
import com.replyboss.store.Store;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 리뷰 한 건. 원문은 저장하지 않고 마스킹된 본문만 저장한다.
 */
@Entity
@Table(name = "review", indexes = @Index(name = "idx_review_store_created", columnList = "store_id, created_at"))
public class Review {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "store_id", nullable = false)
    private Store store;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Platform platform;

    @Column(nullable = false)
    private int rating;

    @Column(name = "masked_content", columnDefinition = "TEXT")
    private String maskedContent;

    @Column(name = "has_content", nullable = false)
    private boolean hasContent;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private ReviewType type;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private Sentiment sentiment;

    /** 키워드 1~3개 (JSON 배열) */
    @Column(columnDefinition = "TEXT")
    private String keywords;

    private Double confidence;

    /** 유사 리뷰 묶음 ID (중복 방지 1단, 4주차) */
    @Column(name = "group_id", length = 40)
    private String groupId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ReviewStatus status;

    /** 분류 실패 사유 코드 (LLM_FAILED, LLM_NOT_CONFIGURED) */
    @Column(name = "failure_code", length = 40)
    private String failureCode;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    protected Review() {
    }

    public Review(Store store, Platform platform, int rating, String maskedContent) {
        this.store = store;
        this.platform = platform;
        this.rating = rating;
        this.maskedContent = maskedContent == null || maskedContent.isBlank() ? null : maskedContent;
        this.hasContent = this.maskedContent != null;
        this.status = ReviewStatus.PENDING;
    }

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    /** 본문이 없는 리뷰: LLM 없이 규칙으로 분류한다. */
    public void markRatingOnly() {
        this.type = ReviewType.RATING_ONLY;
        this.sentiment = Sentiment.fromRating(rating);
        this.keywords = JsonText.write(List.of());
        this.confidence = 1.0;
        this.status = ReviewStatus.CLASSIFIED;
        this.failureCode = null;
    }

    public void applyClassification(ClassificationResult result) {
        this.type = result.type();
        this.sentiment = result.sentiment();
        this.keywords = JsonText.write(result.keywords());
        this.confidence = result.confidence();
        this.status = ReviewStatus.CLASSIFIED;
        this.failureCode = null;
    }

    public void markFailed(String code) {
        this.status = ReviewStatus.FAILED;
        this.failureCode = code;
    }

    public Long getId() {
        return id;
    }

    public Store getStore() {
        return store;
    }

    public Platform getPlatform() {
        return platform;
    }

    public int getRating() {
        return rating;
    }

    public String getMaskedContent() {
        return maskedContent;
    }

    public boolean hasContent() {
        return hasContent;
    }

    public ReviewType getType() {
        return type;
    }

    public Sentiment getSentiment() {
        return sentiment;
    }

    public List<String> getKeywords() {
        return JsonText.readStringList(keywords);
    }

    public Double getConfidence() {
        return confidence;
    }

    public String getGroupId() {
        return groupId;
    }

    public ReviewStatus getStatus() {
        return status;
    }

    public String getFailureCode() {
        return failureCode;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}
