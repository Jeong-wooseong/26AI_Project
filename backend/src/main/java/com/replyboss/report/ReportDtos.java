package com.replyboss.report;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
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
            /** 별점별 리뷰 수 [1점, 2점, 3점, 4점, 5점] (이번 주 / 지난주) */
            List<Integer> ratingCounts,
            List<Integer> previousRatingCounts,
            Map<String, Integer> typeCounts,
            int complaints,
            int previousComplaints,
            Integer complaintRate,
            Integer previousComplaintRate,
            List<TopicStat> topics,
            /** 지난주에는 있었지만 이번 주에는 없어진 불만 주제 (개선된 점) */
            List<TopicStat> resolvedTopics,
            List<RepresentativeReview> representatives,
            ReplyStats replies,
            /** 지난주 리뷰 기준 답글 현황 (지난주와 비교용) */
            ReplyStats previousReplies,
            /** 긍정 리뷰 비율 % (감정이 긍정인 리뷰 / 전체, 이번 주 / 지난주) */
            Integer positiveRate,
            Integer previousPositiveRate,
            /** 날짜별 집계 (월~일 7일, 이번 주 / 지난주 같은 요일) */
            List<DailyStat> daily,
            List<DailyStat> previousDaily
    ) {
    }

    /** 하루 집계: 리뷰 수, 평균 별점(리뷰 없으면 null), 긍정·불만 리뷰 수 */
    public record DailyStat(LocalDate date, int total, Double avgRating, int positive, int complaints) {
    }

    /**
     * 분석 항목 하나: text 내용(한 문장), basis 근거(어떤 집계 수치·리뷰에서 나왔는지. 제안이면 왜 하는지).
     * 예전(v3)에 저장한 분석은 항목이 문장 하나뿐이라, 문자열도 근거 없는 항목으로 읽는다.
     */
    public record InsightItem(String text, String basis) {
        @JsonCreator(mode = JsonCreator.Mode.PROPERTIES)
        public InsightItem(@JsonProperty("text") String text, @JsonProperty("basis") String basis) {
            this.text = text;
            this.basis = basis == null || basis.isBlank() ? null : basis;
        }

        @JsonCreator(mode = JsonCreator.Mode.DELEGATING)
        public static InsightItem of(String text) {
            return new InsightItem(text, null);
        }
    }

    /**
     * AI 가 쓴 분석. summary 요약, positives 좋아진 점, improvements 개선이 필요한 점, suggestions 바로 해볼 제안.
     * stale 이면 만든 뒤 리뷰가 바뀐 것
     */
    public record Insight(String summary, List<InsightItem> positives, List<InsightItem> improvements, List<InsightItem> suggestions,
                          LocalDateTime generatedAt, boolean stale) {
        static Insight of(InsightText t, LocalDateTime at, boolean stale) {
            return new Insight(t.summary(), orEmpty(t.positives()), orEmpty(t.improvements()), orEmpty(t.suggestions()), at, stale);
        }
    }

    static <T> List<T> orEmpty(List<T> list) {
        return list == null ? List.of() : list;
    }

    public record ReportResponse(WeeklyStats stats, Insight insight) {
    }

    /** 저장 형식. 예전에 저장한 요약에는 positives·improvements 가 없다 (null) */
    public record InsightText(String summary, List<InsightItem> positives, List<InsightItem> improvements,
                              List<InsightItem> suggestions) {
    }
}
