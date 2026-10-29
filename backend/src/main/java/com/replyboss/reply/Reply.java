package com.replyboss.reply;

import com.replyboss.review.Review;
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
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 답글 초안. 2주차에는 평점만 리뷰의 템플릿 답글만 만들고,
 * 3주차 3톤 생성·4주차 중복 방지·악성 가이드도 이 테이블을 쓴다.
 */
@Entity
@Table(name = "reply")
public class Reply {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "review_id", nullable = false)
    private Review review;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "template_id")
    private ReplyTemplate template;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ReplyTone tone;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    /** 사장님 수정본 (수정률 계산용) */
    @Column(name = "edited_content", columnDefinition = "TEXT")
    private String editedContent;

    /** 4주차: 답글 임베딩 (JSON 배열) */
    @Column(columnDefinition = "TEXT")
    private String embedding;

    @Column(name = "max_similarity")
    private Double maxSimilarity;

    @Column(name = "regen_count", nullable = false)
    private int regenCount;

    @Column(name = "is_selected", nullable = false)
    private boolean selected;

    /** 악성 리뷰 가이드: 사장님이 확인할 것 (JSON 배열) */
    @Column(name = "strategy_checklist", columnDefinition = "TEXT")
    private String strategyChecklist;

    /** 4주차: 악성 리뷰 전략 APOLOGY / FACT / HOLD */
    @Column(length = 20)
    private String strategy;

    @Column(name = "strategy_reason", columnDefinition = "TEXT")
    private String strategyReason;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    protected Reply() {
    }

    public Reply(Review review, ReplyTemplate template, ReplyTone tone, String content) {
        this.review = review;
        this.template = template;
        this.tone = tone;
        this.content = content;
    }

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
    }

    /** 최종 답글로 확정한다. 내용을 고쳤으면 수정본으로 남기고, 원래 초안과 같으면 수정본을 지운다. */
    public void markFinal(String finalText) {
        this.selected = true;
        String text = finalText == null ? "" : finalText.strip();
        String before = getText();
        this.editedContent = text.isEmpty() || text.equals(content) ? null : text;
        if (!getText().equals(before)) {
            this.embedding = null; // 문장이 바뀌었으므로 다음 비교 때 다시 계산
        }
    }

    /** 다른 답글이 최종으로 바뀌었을 때 */
    public void unmarkFinal() {
        this.selected = false;
    }

    /** 사장님이 보는 최종 문장 (수정본이 있으면 수정본) */
    public String getText() {
        return editedContent != null ? editedContent : content;
    }

    /** (이전 방식) 복사한 답글 기록. 화면은 더 이상 쓰지 않으며 확정은 markFinal 로 한다. */
    public void select(String editedContent) {
        this.selected = true;
        if (editedContent != null && !editedContent.isBlank() && !editedContent.strip().equals(content)) {
            this.editedContent = editedContent.strip();
        }
    }

    /** 중복 방지 3단: 이 답글의 임베딩과, 만들 때 최근 답글과 가장 비슷했던 정도, 다시 생성한 횟수 */
    public void recordSimilarity(String embedding, Double maxSimilarity, int regenCount) {
        this.embedding = embedding;
        this.maxSimilarity = maxSimilarity;
        this.regenCount = regenCount;
    }

    public void recordEmbedding(String embedding) {
        this.embedding = embedding;
    }

    /** 악성 리뷰 대응 가이드 내용 */
    public void recordStrategy(String strategy, String reason, String checklistJson) {
        this.strategy = strategy;
        this.strategyReason = reason;
        this.strategyChecklist = checklistJson;
    }

    public String getEmbedding() {
        return embedding;
    }

    public Double getMaxSimilarity() {
        return maxSimilarity;
    }

    public int getRegenCount() {
        return regenCount;
    }

    public String getStrategy() {
        return strategy;
    }

    public String getStrategyReason() {
        return strategyReason;
    }

    public String getStrategyChecklist() {
        return strategyChecklist;
    }

    public Long getId() {
        return id;
    }

    public Review getReview() {
        return review;
    }

    public ReplyTemplate getTemplate() {
        return template;
    }

    public ReplyTone getTone() {
        return tone;
    }

    public String getContent() {
        return content;
    }

    public String getEditedContent() {
        return editedContent;
    }

    public boolean isSelected() {
        return selected;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}
