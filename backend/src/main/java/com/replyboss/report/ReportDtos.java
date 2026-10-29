package com.replyboss.report;

import com.replyboss.review.Platform;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public final class ReportDtos {

    private ReportDtos() {
    }

    /** 불만 주제 하나: 이번 주·지난주 리뷰 수 */
    public record TopicStat(String topic, int count, int previousCount, int change) {
        public static TopicStat of(String topic, int count, int previousCount) {
            return new TopicStat(topic, count, previousCount, count - previousCount);
        }
    }

    public record RepresentativeReview(Long reviewId, Platform platform, int rating, String maskedContent,
                                       String topic, LocalDate date) {
    }

    /**
     * 답글 현황 (이번 주 리뷰 기준).
     * @param target        답글 대상 (분류된 리뷰)
     * @param completed     작성 완료 (최종 답글 확정)
     * @param edited        최종 답글을 사장님이 고친 수 (수정률 계산용)
     * @param regenerated   최종 답글 중 중복·규칙 때문에 다시 생성됐던 초안 수
     */
    public record ReplyStats(int target, int completed, int edited, int regenerated,
                             Integer completionRate, Integer editRate) {
        public static ReplyStats of(int target, int completed, int edited, int regenerated) {
            return new ReplyStats(target, completed, edited, regenerated,
                    target == 0 ? null : (int) Math.round(completed * 100.0 / target),
                    completed == 0 ? null : (int) Math.round(edited * 100.0 / completed));
        }
    }

    /** 서버에서 집계한 수치 (AI 가 만들지 않음) */
    public record WeeklyStats(
            LocalDate weekStart,
            LocalDate weekEnd,
            int total,
            int previousTotal,
            Double avgRating,
            Double previousAvgRating,
            Map<String, Integer> typeCounts,
            int complaints,
            int previousComplaints,
            Integer complaintRate,
            List<TopicStat> topics,
            List<RepresentativeReview> representatives,
            ReplyStats replies
    ) {
    }

    /** AI 가 쓴 요약·개선 제안. stale 이면 만든 뒤 리뷰가 바뀐 것 */
    public record Insight(String summary, List<String> suggestions, LocalDateTime generatedAt, boolean stale) {
    }

    public record ReportResponse(WeeklyStats stats, Insight insight) {
    }

    public record InsightText(String summary, List<String> suggestions) {
    }
}
