package com.replyboss.store;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "store")
public class Store {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 50)
    private String category;

    /** 사장님이 직접 적은 매장 소개·운영 방식 (선택). 답글에는 여기 적힌 내용만 운영 방식으로 언급한다. */
    @Column(columnDefinition = "TEXT")
    private String info;

    /** ToneProfile 을 JSON 문자열로 저장 */
    @Column(name = "tone_profile", columnDefinition = "TEXT")
    private String toneProfile;

    /** 톤 추출에 쓴 예시 답글 목록 (JSON 배열) */
    @Column(name = "sample_replies", columnDefinition = "TEXT")
    private String sampleReplies;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    protected Store() {
    }

    public Store(String name, String category) {
        this.name = name;
        this.category = category;
    }

    public Store(String name, String category, String info) {
        this(name, category);
        this.info = info;
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

    public void rename(String name, String category) {
        this.name = name;
        this.category = category;
    }

    public void describe(String info) {
        this.info = info;
    }

    public void updateTone(String toneProfileJson, String sampleRepliesJson) {
        this.toneProfile = toneProfileJson;
        if (sampleRepliesJson != null) {
            this.sampleReplies = sampleRepliesJson;
        }
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getCategory() {
        return category;
    }

    public String getInfo() {
        return info;
    }

    public String getToneProfile() {
        return toneProfile;
    }

    public String getSampleReplies() {
        return sampleReplies;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}
