package com.replyboss.report;

import com.fasterxml.jackson.databind.JsonNode;
import com.replyboss.ai.LlmClient;
import com.replyboss.ai.LlmException;
import com.replyboss.ai.LlmRequest;
import com.replyboss.ai.OpenAiProperties;
import com.replyboss.ai.PromptTemplates;
import com.replyboss.common.ApiException;
import com.replyboss.common.JsonText;
import com.replyboss.reply.Reply;
import com.replyboss.reply.ReplyRepository;
import com.replyboss.report.ReportDtos.Insight;
import com.replyboss.report.ReportDtos.InsightText;
import com.replyboss.report.ReportDtos.ReplyStats;
import com.replyboss.report.ReportDtos.ReportResponse;
import com.replyboss.report.ReportDtos.RepresentativeReview;
import com.replyboss.report.ReportDtos.TopicStat;
import com.replyboss.report.ReportDtos.WeeklyStats;
import com.replyboss.review.Review;
import com.replyboss.review.ReviewRepository;
import com.replyboss.review.ReviewStatus;
import com.replyboss.review.ReviewType;
import com.replyboss.store.Store;
import com.replyboss.store.StoreService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static com.replyboss.ai.Schemas.arrayOf;
import static com.replyboss.ai.Schemas.object;
import static com.replyboss.ai.Schemas.props;
import static com.replyboss.ai.Schemas.string;

/**
 * 기능 6. 주간 인사이트 리포트.
 * 수치(리뷰 수, 불만 주제 순위, 전주 대비 변화, 대표 리뷰, 답글 현황)는 서버가 집계하고,
 * AI 는 그 수치를 받아 요약과 개선 제안 문장만 쓴다. AI 문장에 집계에 없는 숫자가 있으면 다시 만든다.
 * 한 주는 월요일~일요일이며, 리뷰 날짜는 고객 작성일이 있으면 작성일, 없으면 등록일이다.
 */
@Service
public class ReportService {

    private static final Logger log = LoggerFactory.getLogger(ReportService.class);
    static final String PROMPT = "weekly_report_v1";
    static final int TOP_TOPICS = 5;
    static final int REPRESENTATIVES = 3;

    private static final Map<String, Object> SCHEMA = object(props(
            "summary", string(),
            "suggestions", arrayOf(string())
    ));
    private static final Pattern NUMBER = Pattern.compile("\\d+(?:\\.\\d+)?");

    private final ReviewRepository reviewRepository;
    private final ReplyRepository replyRepository;
    private final WeeklyReportRepository reportRepository;
    private final StoreService storeService;
    private final LlmClient llmClient;
    private final PromptTemplates prompts;
    private final OpenAiProperties props;

    public ReportService(ReviewRepository reviewRepository, ReplyRepository replyRepository,
                         WeeklyReportRepository reportRepository, StoreService storeService,
                         LlmClient llmClient, PromptTemplates prompts, OpenAiProperties props) {
        this.reviewRepository = reviewRepository;
        this.replyRepository = replyRepository;
        this.reportRepository = reportRepository;
        this.storeService = storeService;
        this.llmClient = llmClient;
        this.prompts = prompts;
        this.props = props;
    }

    /** 그 날짜가 속한 주의 월요일 */
    public static LocalDate weekStartOf(LocalDate date) {
        return date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    }

    /** 집계 + 저장된 AI 요약 (요약은 만들지 않음) */
    @Transactional(readOnly = true)
    public ReportResponse report(Long storeId, LocalDate date) {
        storeService.get(storeId);
        WeeklyStats stats = stats(storeId, weekStartOf(date));
        Insight insight = reportRepository.findByStore_IdAndWeekStart(storeId, stats.weekStart())
                .filter(r -> r.getResult() != null)
                .map(r -> {
                    InsightText text = JsonText.read(r.getResult(), InsightText.class);
                    return new Insight(text.summary(), text.suggestions(), r.getGeneratedAt(), !statsKey(stats).equals(r.getStatsKey()));
                })
                .orElse(null);
        return new ReportResponse(stats, insight);
    }

    /** AI 요약·개선 제안을 만들어 저장한다 (다시 부르면 새로 만듦) */
    public ReportResponse generateInsight(Long storeId, LocalDate date) {
        Store store = storeService.get(storeId);
        WeeklyStats stats = stats(storeId, weekStartOf(date));
        if (stats.total() == 0) {
            throw ApiException.badRequest("NO_REVIEWS", "이 주에 등록된 리뷰가 없어 요약을 만들 수 없습니다.");
        }
        String user = userMessage(store, stats);
        Set<String> allowed = allowedNumbers(stats);
        InsightText text = call(user);
        List<String> unknown = unknownNumbers(text, allowed);
        if (!unknown.isEmpty()) {
            log.info("주간 리포트 요약에 집계에 없는 숫자 {} → 다시 생성", unknown);
            text = call(user + "\n\n[이전 답변의 문제 — 고쳐서 다시 작성]\n- 집계에 없는 숫자를 씀: "
                    + String.join(", ", unknown) + ". [집계]의 숫자만 쓰거나 숫자 없이 쓸 것");
            if (!unknownNumbers(text, allowed).isEmpty()) {
                throw new LlmException("집계와 맞지 않는 숫자가 있어 요약을 만들지 못했습니다", null, "LLM_INVALID");
            }
        }
        WeeklyReport saved = reportRepository.findByStore_IdAndWeekStart(storeId, stats.weekStart())
                .orElseGet(() -> new WeeklyReport(store, stats.weekStart()));
        LocalDateTime now = LocalDateTime.now().truncatedTo(ChronoUnit.SECONDS);
        saved.update(JsonText.write(text), statsKey(stats), now);
        reportRepository.save(saved);
        return new ReportResponse(stats, new Insight(text.summary(), text.suggestions(), now, false));
    }

    // ── 집계 ─────────────────────────────────────────

    WeeklyStats stats(Long storeId, LocalDate weekStart) {
        LocalDate weekEnd = weekStart.plusDays(6);
        List<Review> current = inWeek(storeId, weekStart);
        List<Review> previous = inWeek(storeId, weekStart.minusWeeks(1));

        Map<String, Integer> typeCounts = new LinkedHashMap<>();
        for (Review r : current) {
            String key = r.getStatus() == ReviewStatus.FAILED || r.getType() == null ? "FAILED" : r.getType().name();
            typeCounts.merge(key, 1, Integer::sum);
        }
        List<Review> complaints = complaintsOf(current);
        List<Review> previousComplaints = complaintsOf(previous);

        Map<String, Integer> now = topicCounts(complaints);
        Map<String, Integer> before = topicCounts(previousComplaints);
        List<TopicStat> topics = now.entrySet().stream()
                .map(e -> TopicStat.of(e.getKey(), e.getValue(), before.getOrDefault(e.getKey(), 0)))
                .sorted(Comparator.comparingInt(TopicStat::count).reversed()
                        .thenComparing(Comparator.comparingInt(TopicStat::change).reversed())
                        .thenComparing(TopicStat::topic))
                .limit(TOP_TOPICS)
                .toList();

        return new WeeklyStats(weekStart, weekEnd, current.size(), previous.size(),
                average(current), average(previous), typeCounts,
                complaints.size(), previousComplaints.size(),
                current.isEmpty() ? null : (int) Math.round(complaints.size() * 100.0 / current.size()),
                topics, representatives(complaints, topics), replyStats(current));
    }

    private List<Review> inWeek(Long storeId, LocalDate weekStart) {
        LocalDate to = weekStart.plusWeeks(1);
        return reviewRepository.findInPeriod(storeId, weekStart, to, weekStart.atStartOfDay(), to.atStartOfDay());
    }

    private static List<Review> complaintsOf(List<Review> reviews) {
        return reviews.stream()
                .filter(r -> r.getStatus() == ReviewStatus.CLASSIFIED && r.getType() == ReviewType.COMPLAINT)
                .toList();
    }

    /** 불만 리뷰의 키워드별 리뷰 수 (같은 리뷰 안의 같은 키워드는 한 번만) */
    static Map<String, Integer> topicCounts(List<Review> complaints) {
        Map<String, Integer> counts = new HashMap<>();
        for (Review r : complaints) {
            Set<String> seen = new HashSet<>();
            for (String k : r.getKeywords()) {
                String topic = normalize(k);
                if (!topic.isEmpty() && seen.add(topic)) {
                    counts.merge(topic, 1, Integer::sum);
                }
            }
        }
        return counts;
    }

    static String normalize(String keyword) {
        return keyword == null ? "" : keyword.strip().replaceAll("\\s+", " ");
    }

    private static Double average(List<Review> reviews) {
        if (reviews.isEmpty()) {
            return null;
        }
        double avg = reviews.stream().mapToInt(Review::getRating).average().orElse(0);
        return Math.round(avg * 10) / 10.0;
    }

    /** 상위 주제마다 한 건씩 (별점 낮은 순, 본문 긴 순), 모자라면 나머지 불만 리뷰로 채운다 */
    private static List<RepresentativeReview> representatives(List<Review> complaints, List<TopicStat> topics) {
        Comparator<Review> order = Comparator.comparingInt(Review::getRating)
                .thenComparing(r -> -(r.getMaskedContent() == null ? 0 : r.getMaskedContent().length()))
                .thenComparing(Review::getId);
        List<RepresentativeReview> out = new ArrayList<>();
        Set<Long> used = new HashSet<>();
        for (TopicStat t : topics) {
            if (out.size() >= REPRESENTATIVES) {
                break;
            }
            complaints.stream()
                    .filter(r -> !used.contains(r.getId()) && r.getKeywords().stream().map(ReportService::normalize).anyMatch(t.topic()::equals))
                    .min(order)
                    .ifPresent(r -> {
                        used.add(r.getId());
                        out.add(representative(r, t.topic()));
                    });
        }
        complaints.stream().filter(r -> !used.contains(r.getId())).sorted(order)
                .limit(Math.max(0, REPRESENTATIVES - out.size()))
                .forEach(r -> out.add(representative(r, r.getKeywords().isEmpty() ? null : normalize(r.getKeywords().get(0)))));
        return out;
    }

    private static RepresentativeReview representative(Review r, String topic) {
        LocalDate date = r.getWrittenOn() != null ? r.getWrittenOn() : r.getCreatedAt().toLocalDate();
        return new RepresentativeReview(r.getId(), r.getPlatform(), r.getRating(), r.getMaskedContent(), topic, date);
    }

    private ReplyStats replyStats(List<Review> reviews) {
        List<Review> target = reviews.stream().filter(r -> r.getStatus() == ReviewStatus.CLASSIFIED).toList();
        List<Long> finalIds = target.stream().map(Review::getFinalReplyId).filter(Objects::nonNull).toList();
        List<Reply> finals = finalIds.isEmpty() ? List.of() : replyRepository.findAllById(finalIds);
        int edited = (int) finals.stream().filter(r -> r.getEditedContent() != null).count();
        int regenerated = (int) finals.stream().filter(r -> r.getRegenCount() > 0).count();
        return ReplyStats.of(target.size(), finals.size(), edited, regenerated);
    }

    /** 요약을 만든 뒤 수치가 바뀌었는지 비교하기 위한 값 */
    static String statsKey(WeeklyStats s) {
        StringBuilder sb = new StringBuilder();
        sb.append(s.total()).append('|').append(s.complaints()).append('|').append(s.avgRating()).append('|')
                .append(s.previousTotal()).append('|').append(s.previousComplaints());
        s.topics().forEach(t -> sb.append('|').append(t.topic()).append(':').append(t.count()).append(':').append(t.previousCount()));
        return sb.toString();
    }

    // ── AI 요약 ──────────────────────────────────────

    private InsightText call(String user) {
        JsonNode json = llmClient.generateJson(new LlmRequest(
                props.generateModel(), prompts.render(PROMPT, Map.of()), user, "weekly_insight", SCHEMA, 2000));
        String summary = json.path("summary").asText("").strip();
        List<String> suggestions = new ArrayList<>();
        json.path("suggestions").forEach(n -> {
            String item = n.asText("").strip();
            if (!item.isEmpty() && suggestions.size() < 3) {
                suggestions.add(item);
            }
        });
        if (summary.isEmpty()) {
            throw new LlmException("요약이 비어 있습니다", null, "LLM_INVALID");
        }
        return new InsightText(summary, suggestions);
    }

    static String userMessage(Store store, WeeklyStats s) {
        StringBuilder sb = new StringBuilder();
        sb.append("[매장] ").append(store.getName()).append(" (").append(store.getCategory()).append(")\n");
        sb.append("[집계] (").append(s.weekStart()).append(" ~ ").append(s.weekEnd()).append(")\n");
        sb.append("- 이번 주 리뷰: ").append(s.total()).append("건, 지난주: ").append(s.previousTotal()).append("건\n");
        sb.append("- 평균 별점: ").append(s.avgRating() == null ? "없음" : fmt(s.avgRating()))
                .append(", 지난주: ").append(s.previousAvgRating() == null ? "없음" : fmt(s.previousAvgRating())).append('\n');
        sb.append("- 불만 리뷰: ").append(s.complaints()).append("건")
                .append(s.complaintRate() == null ? "" : " (전체의 " + s.complaintRate() + "%)")
                .append(", 지난주: ").append(s.previousComplaints()).append("건\n");
        sb.append("- 유형별: ");
        s.typeCounts().forEach((k, v) -> sb.append(k).append(' ').append(v).append("건 "));
        sb.append('\n');
        sb.append("- 불만 주제 순위 (이번 주 / 지난주):");
        if (s.topics().isEmpty()) {
            sb.append(" 없음");
        }
        for (TopicStat t : s.topics()) {
            sb.append("\n  · ").append(t.topic()).append(": ").append(t.count()).append("건 / ").append(t.previousCount()).append("건");
        }
        sb.append('\n');
        ReplyStats r = s.replies();
        sb.append("- 답글 작성 완료: ").append(r.completed()).append("건 / 대상 ").append(r.target()).append("건");
        if (r.completionRate() != null) {
            sb.append(" (").append(r.completionRate()).append("%)");
        }
        sb.append('\n');
        sb.append("[대표 불만 리뷰]");
        if (s.representatives().isEmpty()) {
            sb.append(" 없음");
        }
        for (RepresentativeReview rep : s.representatives()) {
            sb.append("\n- (별점 ").append(rep.rating()).append(", 주제 ").append(rep.topic() == null ? "없음" : rep.topic())
                    .append(") ").append(rep.maskedContent());
        }
        return sb.toString();
    }

    private static String fmt(double v) {
        return String.format(Locale.ROOT, "%.1f", v);
    }

    /** AI 문장에 써도 되는 숫자: 집계에 나온 값과 날짜(월·일) */
    static Set<String> allowedNumbers(WeeklyStats s) {
        Set<String> allowed = new LinkedHashSet<>();
        List<Number> values = new ArrayList<>(List.of(s.total(), s.previousTotal(), s.complaints(), s.previousComplaints(),
                Math.abs(s.total() - s.previousTotal()), Math.abs(s.complaints() - s.previousComplaints()),
                s.replies().target(), s.replies().completed(), s.replies().edited(), s.replies().regenerated()));
        if (s.complaintRate() != null) {
            values.add(s.complaintRate());
        }
        if (s.replies().completionRate() != null) {
            values.add(s.replies().completionRate());
        }
        if (s.replies().editRate() != null) {
            values.add(s.replies().editRate());
        }
        s.typeCounts().values().forEach(values::add);
        for (TopicStat t : s.topics()) {
            values.add(t.count());
            values.add(t.previousCount());
            values.add(Math.abs(t.change()));
        }
        for (RepresentativeReview r : s.representatives()) {
            values.add(r.rating());
        }
        values.forEach(v -> allowed.add(String.valueOf(v)));
        for (Double avg : new Double[]{s.avgRating(), s.previousAvgRating()}) {
            if (avg != null) {
                allowed.add(fmt(avg));
                if (avg == Math.floor(avg)) {
                    allowed.add(String.valueOf(avg.intValue()));
                }
            }
        }
        for (LocalDate d : List.of(s.weekStart(), s.weekEnd())) {
            allowed.add(String.valueOf(d.getMonthValue()));
            allowed.add(String.valueOf(d.getDayOfMonth()));
            allowed.add(String.valueOf(d.getYear()));
        }
        return allowed;
    }

    static List<String> unknownNumbers(InsightText text, Set<String> allowed) {
        List<String> unknown = new ArrayList<>();
        List<String> parts = new ArrayList<>(text.suggestions());
        parts.add(text.summary());
        for (String part : parts) {
            Matcher m = NUMBER.matcher(part);
            while (m.find()) {
                if (!allowed.contains(m.group()) && !unknown.contains(m.group())) {
                    unknown.add(m.group());
                }
            }
        }
        return unknown;
    }
}
