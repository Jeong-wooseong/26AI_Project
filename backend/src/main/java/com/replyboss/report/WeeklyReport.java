package com.replyboss.report;

import com.replyboss.store.Store;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 주간 리포트의 AI 요약·제안 (수치는 저장하지 않고 볼 때마다 다시 집계한다).
 * statsKey 는 요약을 만들 때의 집계값이라, 리뷰가 바뀌면 화면에서 '다시 만들기'를 안내한다.
 */
@Entity
@Table(name = "weekly_report", uniqueConstraints = @UniqueConstraint(columnNames = {"store_id", "week_start"}))
public class WeeklyReport {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "store_id", nullable = false)
    private Store store;

    @Column(name = "week_start", nullable = false)
    private LocalDate weekStart;

    /** { summary, suggestions[] } JSON */
    @Column(columnDefinition = "TEXT")
    private String result;

    @Column(name = "stats_key", columnDefinition = "TEXT")
    private String statsKey;

    @Column(name = "generated_at")
    private LocalDateTime generatedAt;

    protected WeeklyReport() {
    }

    public WeeklyReport(Store store, LocalDate weekStart) {
        this.store = store;
        this.weekStart = weekStart;
    }

    public void update(String resultJson, String statsKey, LocalDateTime generatedAt) {
        this.result = resultJson;
        this.statsKey = statsKey;
        this.generatedAt = generatedAt;
    }

    public Long getId() {
        return id;
    }

    public LocalDate getWeekStart() {
        return weekStart;
    }

    public String getResult() {
        return result;
    }

    public String getStatsKey() {
        return statsKey;
    }

    public LocalDateTime getGeneratedAt() {
        return generatedAt;
    }
}
