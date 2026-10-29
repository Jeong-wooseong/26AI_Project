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

import java.time.LocalDate;
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

    /** 본문 임베딩 (비슷한 리뷰 묶기용, "[...]" 문자열). 임베딩을 못 받았으면 null */
    @Column(columnDefinition = "TEXT")
    private String embedding;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ReviewStatus status;

    /** 분류 실패 사유 코드 (LLM_FAILED, LLM_NOT_CONFIGURED) */
    @Column(name = "failure_code", length = 40)
    private String failureCode;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /** 고객이 리뷰를 쓴 날짜 (일괄 가져오기에서 알 수 있을 때만, 없으면 null). 등록일은 createdAt. */
    @Column(name = "written_on")
    private LocalDate writtenOn;

    /**
     * 사장님이 최종 확정한 답글 ID (없으면 아직 작성 전). 리뷰 하나에 최종 답글은 하나뿐이다.
     * 외부 플랫폼 게시 여부가 아니라, 붙여넣을 답글을 확정했다는 뜻이다.
     */
    @Column(name = "final_reply_id")
    private Long finalReplyId;

    /** 처음 작성 완료한 시각 (최종 답글을 나중에 고쳐도 바뀌지 않음) */
    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    /** 최종 답글을 마지막으로 저장한 시각 */
    @Column(name = "final_updated_at")
    private LocalDateTime finalUpdatedAt;

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

    public void recordWrittenOn(LocalDate date) {
        this.writtenOn = date;
    }

    public void markFailed(String code) {
        this.status = ReviewStatus.FAILED;
        this.failureCode = code;
    }

    /** 답글을 최종 확정(또는 확정한 답글을 수정)한다. */
    public void completeWith(Long replyId, LocalDateTime now) {
        this.finalReplyId = replyId;
        if (completedAt == null) {
            completedAt = now;
        }
        finalUpdatedAt = now;
    }

    public boolean isCompleted() {
        return finalReplyId != null;
    }

    public Long getFinalReplyId() {
        return finalReplyId;
    }

    public LocalDateTime getCompletedAt() {
        return completedAt;
    }

    public LocalDateTime getFinalUpdatedAt() {
        return finalUpdatedAt;
    }

    public LocalDate getWrittenOn() {
        return writtenOn;
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

    /** 중복 방지 1단: 비슷한 리뷰 묶음에 넣는다 */
    public void joinGroup(String groupId) {
        this.groupId = groupId;
    }

    public String getEmbedding() {
        return embedding;
    }

    public void recordEmbedding(String embedding) {
        this.embedding = embedding;
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
