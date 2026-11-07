package com.replyboss.admin;

import com.replyboss.ai.AiCallLog;
import com.replyboss.ai.AiCallLogRepository;
import com.replyboss.ai.OpenAiProperties;
import com.replyboss.auth.AppUser;
import com.replyboss.auth.AppUserRepository;
import com.replyboss.auth.AuthTokenRepository;
import com.replyboss.auth.MailService;
import com.replyboss.common.ApiException;
import com.replyboss.review.ReviewRepository;
import com.replyboss.store.Store;
import com.replyboss.store.StoreRepository;
import com.replyboss.support.Inquiry;
import com.replyboss.support.InquiryRepository;
import com.replyboss.support.InquiryStatus;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 관리자 운영 화면: 대시보드 수치, 일별 이용량, 기능별 이용 현황, 서비스 상태(AI 호출 성공·실패), 회원 관리.
 * 모든 값은 DB 에 실제로 쌓인 기록으로 계산한다. AI 호출 기록은 기록 기능을 넣은 뒤부터 쌓인다(aiLogSince).
 */
@Service
public class AdminOpsService {

    static final int DAYS = 14;

    public record Daily(LocalDate date, int reviews, int activeUsers, int signups, int aiCalls, int aiFailures) {
    }

    public record KindStat(String kind, int success, int failure) {
    }

    public record SystemStatus(boolean database, boolean openAiConfigured, boolean mailConfigured,
                               LocalDateTime lastAiSuccessAt, LocalDateTime lastAiFailureAt,
                               int aiCalls24h, int aiFailures24h) {
    }

    public record Overview(
            int users, int activeUsers7d, int newUsers7d, int disabledUsers,
            long reviews, int reviews7d, long completed7d,
            int aiCalls7d, int aiFailures7d, LocalDateTime aiLogSince,
            int inquiries, int openInquiries,
            List<Daily> daily, List<KindStat> aiByKind, SystemStatus system
    ) {
    }

    public record UserRow(Long id, String email, String name, String role, String status, String storeName,
                          LocalDateTime joinedAt, LocalDateTime lastLoginAt, long reviewCount) {
    }

    public record StoreRow(Long id, String name, String category, long reviews, long completed, boolean styleReady) {
    }

    public record InquiryRow(Long id, String title, String status, LocalDateTime createdAt) {
    }

    public record UserDetail(UserRow user, List<StoreRow> stores, List<InquiryRow> inquiries, LocalDateTime disabledAt) {
    }

    public record AiLogRow(Long id, String kind, String model, boolean success, String errorCode, String errorMessage,
                           long durationMs, LocalDateTime createdAt) {
        static AiLogRow of(AiCallLog l) {
            return new AiLogRow(l.getId(), l.getKind(), l.getModel(), l.isSuccess(), l.getErrorCode(), l.getErrorMessage(),
                    l.getDurationMs(), l.getCreatedAt());
        }
    }

    private final AppUserRepository users;
    private final StoreRepository stores;
    private final ReviewRepository reviews;
    private final InquiryRepository inquiries;
    private final AiCallLogRepository aiLogs;
    private final AuthTokenRepository tokens;
    private final OpenAiProperties openAi;
    private final MailService mail;

    public AdminOpsService(AppUserRepository users, StoreRepository stores, ReviewRepository reviews,
                           InquiryRepository inquiries, AiCallLogRepository aiLogs, AuthTokenRepository tokens,
                           OpenAiProperties openAi, MailService mail) {
        this.users = users;
        this.stores = stores;
        this.reviews = reviews;
        this.inquiries = inquiries;
        this.aiLogs = aiLogs;
        this.tokens = tokens;
        this.openAi = openAi;
        this.mail = mail;
    }

    @Transactional(readOnly = true)
    public Overview overview() {
        LocalDateTime now = LocalDateTime.now();
        LocalDate today = now.toLocalDate();
        LocalDate first = today.minusDays(DAYS - 1);
        LocalDateTime weekAgo = now.minusDays(7);
        LocalDateTime dayAgo = now.minusDays(1);

        List<AppUser> all = users.findAll();
        int active = (int) all.stream().filter(u -> u.getLastLoginAt() != null && u.getLastLoginAt().isAfter(weekAgo)).count();
        int newUsers = (int) all.stream().filter(u -> u.getCreatedAt() != null && u.getCreatedAt().isAfter(weekAgo)).count();
        int disabled = (int) all.stream().filter(AppUser::isDisabled).count();

        List<Object[]> recentReviews = reviews.findCreatedSince(first.atStartOfDay());
        int reviews7d = (int) recentReviews.stream().filter(r -> ((LocalDateTime) r[0]).isAfter(weekAgo)).count();
        List<AiCallLog> recentAi = aiLogs.findByCreatedAtAfter(first.atStartOfDay());
        int ai7d = (int) recentAi.stream().filter(l -> l.getCreatedAt().isAfter(weekAgo)).count();
        int aiFail7d = (int) recentAi.stream().filter(l -> l.getCreatedAt().isAfter(weekAgo) && !l.isSuccess()).count();

        // 일별: 리뷰 등록 수, 그날 리뷰를 등록한 회원 수, 가입 수, AI 호출·실패 수
        Map<LocalDate, Integer> reviewsByDay = new HashMap<>();
        Map<LocalDate, Set<Long>> activeByDay = new HashMap<>();
        for (Object[] r : recentReviews) {
            LocalDate d = ((LocalDateTime) r[0]).toLocalDate();
            reviewsByDay.merge(d, 1, Integer::sum);
            if (r[1] != null) {
                activeByDay.computeIfAbsent(d, k -> new HashSet<>()).add((Long) r[1]);
            }
        }
        List<Daily> daily = new ArrayList<>();
        for (int i = 0; i < DAYS; i++) {
            LocalDate d = first.plusDays(i);
            int signups = (int) all.stream().filter(u -> u.getCreatedAt() != null && d.equals(u.getCreatedAt().toLocalDate())).count();
            int calls = (int) recentAi.stream().filter(l -> d.equals(l.getCreatedAt().toLocalDate())).count();
            int fails = (int) recentAi.stream().filter(l -> d.equals(l.getCreatedAt().toLocalDate()) && !l.isSuccess()).count();
            daily.add(new Daily(d, reviewsByDay.getOrDefault(d, 0), activeByDay.getOrDefault(d, Set.of()).size(), signups, calls, fails));
        }

        // 작업별 AI 호출 (최근 7일)
        Map<String, int[]> kinds = new LinkedHashMap<>();
        recentAi.stream().filter(l -> l.getCreatedAt().isAfter(weekAgo))
                .forEach(l -> kinds.computeIfAbsent(l.getKind(), k -> new int[2])[l.isSuccess() ? 0 : 1]++);
        List<KindStat> byKind = kinds.entrySet().stream()
                .map(e -> new KindStat(e.getKey(), e.getValue()[0], e.getValue()[1]))
                .sorted(Comparator.comparingInt((KindStat k) -> k.success() + k.failure()).reversed())
                .toList();

        List<Inquiry> allInquiries = inquiries.findAllByOrderByIdDesc();
        int open = (int) allInquiries.stream().filter(q -> q.getStatus() != InquiryStatus.ANSWERED).count();

        List<AiCallLog> last24 = recentAi.stream().filter(l -> l.getCreatedAt().isAfter(dayAgo)).toList();
        SystemStatus system = new SystemStatus(true, openAi.hasApiKey(), mail.isConfigured(),
                aiLogs.findFirstBySuccessTrueOrderByIdDesc().map(AiCallLog::getCreatedAt).orElse(null),
                aiLogs.findFirstBySuccessFalseOrderByIdDesc().map(AiCallLog::getCreatedAt).orElse(null),
                last24.size(), (int) last24.stream().filter(l -> !l.isSuccess()).count());

        return new Overview(all.size(), active, newUsers, disabled,
                reviews.count(), reviews7d, reviews.countByCompletedAtAfter(weekAgo),
                ai7d, aiFail7d, aiLogs.findFirstByOrderByIdAsc().map(AiCallLog::getCreatedAt).orElse(null),
                allInquiries.size(), open, daily, byKind, system);
    }

    /** 회원 목록. status: ACTIVE(이용 중) | DISABLED(이용 중지) | UNVERIFIED(메일 인증 전) */
    @Transactional(readOnly = true)
    public List<UserRow> users(String query, String status) {
        Map<Long, Long> reviewCounts = new HashMap<>();
        reviews.countByOwner().forEach(r -> reviewCounts.put((Long) r[0], (Long) r[1]));
        Map<Long, String> storeNames = new HashMap<>();
        stores.findAll().forEach(s -> {
            if (s.getOwner() != null) {
                storeNames.putIfAbsent(s.getOwner().getId(), s.getName());
            }
        });
        String q = query == null ? "" : query.strip().toLowerCase(Locale.ROOT);
        return users.findAll().stream()
                .map(u -> row(u, storeNames.get(u.getId()), reviewCounts.getOrDefault(u.getId(), 0L)))
                .filter(r -> status == null || status.isBlank() || r.status().equals(status))
                .filter(r -> q.isEmpty() || contains(r.email(), q) || contains(r.name(), q) || contains(r.storeName(), q))
                .sorted(Comparator.comparing(UserRow::joinedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
    }

    @Transactional(readOnly = true)
    public UserDetail user(Long id) {
        AppUser u = users.findById(id).orElseThrow(() -> ApiException.notFound("회원"));
        List<Store> owned = stores.findByOwner_IdOrderByIdAsc(id);
        Map<Long, long[]> counts = new HashMap<>();
        reviews.countByStoreOf(id).forEach(r -> counts.put((Long) r[0],
                new long[]{(Long) r[1], r[2] == null ? 0 : ((Number) r[2]).longValue()}));
        List<StoreRow> storeRows = owned.stream().map(s -> {
            long[] c = counts.getOrDefault(s.getId(), new long[2]);
            return new StoreRow(s.getId(), s.getName(), s.getCategory(), c[0], c[1], s.getToneProfile() != null);
        }).toList();
        List<InquiryRow> inq = inquiries.findByUser_IdOrderByIdDesc(id).stream().limit(5)
                .map(q -> new InquiryRow(q.getId(), q.getTitle(), q.getStatus().name(), q.getCreatedAt())).toList();
        long total = storeRows.stream().mapToLong(StoreRow::reviews).sum();
        return new UserDetail(row(u, owned.isEmpty() ? null : owned.get(0).getName(), total), storeRows, inq, u.getDisabledAt());
    }

    /** 이용 중지·다시 이용. 자기 계정은 바꿀 수 없다. 중지하면 로그인 유지·메일 링크도 함께 무효로 한다 */
    @Transactional
    public UserRow setActive(Long adminId, Long userId, boolean active) {
        if (adminId.equals(userId)) {
            throw ApiException.badRequest("SELF", "자기 계정은 이용 중지할 수 없습니다.");
        }
        AppUser u = users.findById(userId).orElseThrow(() -> ApiException.notFound("회원"));
        u.setDisabled(!active, LocalDateTime.now());
        if (!active) {
            tokens.deleteByUserId(userId);
        }
        return user(userId).user();
    }

    @Transactional(readOnly = true)
    public List<AiLogRow> aiLogs(boolean failedOnly, int limit) {
        PageRequest page = PageRequest.of(0, Math.max(1, Math.min(limit, 200)));
        return (failedOnly ? aiLogs.findBySuccessFalseOrderByIdDesc(page) : aiLogs.findAllByOrderByIdDesc(page))
                .stream().map(AiLogRow::of).toList();
    }

    private static UserRow row(AppUser u, String storeName, long reviewCount) {
        String status = u.isDisabled() ? "DISABLED" : u.isEmailVerified() ? "ACTIVE" : "UNVERIFIED";
        return new UserRow(u.getId(), u.getEmail(), u.getName(), u.getRole().name(), status, storeName,
                u.getCreatedAt(), u.getLastLoginAt(), reviewCount);
    }

    private static boolean contains(String value, String q) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(q);
    }
}
