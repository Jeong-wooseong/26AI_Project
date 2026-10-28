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
