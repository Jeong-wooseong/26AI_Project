package com.replyboss.store;

import com.replyboss.auth.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import com.replyboss.common.JsonText;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "store")
public class Store {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 매장 주인 계정. 계정 기능 이전에 만든 매장은 null 이었다가 첫 가입자에게 넘어간다 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id")
    private AppUser owner;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 50)
    private String category;

    /** 사장님이 직접 적은 매장 소개·운영 방식 (선택). 답글에는 여기 적힌 내용만 운영 방식으로 언급한다. */
    @Column(columnDefinition = "TEXT")
    private String info;

    /** StoreProfile(메뉴·이용 방법·영업시간·연결한 장소)을 JSON 문자열로 저장 */
    @Column(columnDefinition = "TEXT")
    private String profile;

    /** ToneProfile 을 JSON 문자열로 저장 */
    @Column(name = "tone_profile", columnDefinition = "TEXT")
    private String toneProfile;

    /** 톤 추출에 쓴 예시 답글 목록 (JSON 배열) */
    @Column(name = "sample_replies", columnDefinition = "TEXT")
    private String sampleReplies;

    /** 답글 기본 설정: 처음 보여줄 초안 말투 (POLITE·FRIENDLY·CONCISE). null 이면 정중형 */
    @Column(name = "default_tone", length = 20)
    private String defaultTone;

    /** 답글 기본 설정: 이전 답글과 겹치지 않게 다시 만들기. null(기존 매장)이면 켜짐 */
    @Column(name = "avoid_duplicates")
    private Boolean avoidDuplicates;

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

    public void assignOwner(AppUser owner) {
        this.owner = owner;
    }

    public void describe(String info) {
        this.info = info;
    }

    public void updateProfile(StoreProfile profile) {
        this.profile = profile == null ? null : JsonText.write(profile.normalized());
    }

    /** 저장된 메뉴·이용 방법 등 (없으면 빈 값) */
    public StoreProfile profile() {
        StoreProfile p = JsonText.read(profile, StoreProfile.class);
        return p == null ? StoreProfile.EMPTY : p;
    }

    /**
     * 답글 프롬프트의 [확인된 매장 정보]: 사장님이 적은 소개·운영 방식 + 메뉴·이용 방법·영업시간.
     * 적은 것이 하나도 없으면 null. 연결한 장소(주소·링크)는 넣지 않는다.
     */
    public String replyInfo() {
        List<String> lines = new ArrayList<>();
        if (info != null && !info.isBlank()) {
            lines.add("소개·운영 방식: " + info.strip());
        }
        lines.addAll(profile().replyLines());
        return lines.isEmpty() ? null : String.join("\n", lines);
    }

    public void updateTone(String toneProfileJson, String sampleRepliesJson) {
        this.toneProfile = toneProfileJson;
        if (sampleRepliesJson != null) {
            this.sampleReplies = sampleRepliesJson;
        }
    }

    public void updateReplySettings(String defaultTone, boolean avoidDuplicates) {
        this.defaultTone = defaultTone;
        this.avoidDuplicates = avoidDuplicates;
    }

    public String getDefaultTone() {
        return defaultTone == null ? "POLITE" : defaultTone;
    }

    public boolean isAvoidDuplicates() {
        return avoidDuplicates == null || avoidDuplicates;
    }

    public Long getId() {
        return id;
    }

    public AppUser getOwner() {
        return owner;
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
