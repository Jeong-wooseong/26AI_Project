package com.replyboss.auth;

import com.replyboss.reply.ReplyRepository;
import com.replyboss.report.WeeklyReportRepository;
import com.replyboss.review.ReviewRepository;
import com.replyboss.store.StoreRepository;
import com.replyboss.support.SupportService;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 계정 탈퇴 때 그 사장님의 데이터를 지운다: 답글 → 리뷰 → 주간 리포트 → 매장, 문의·첨부 파일 */
@Component
public class AccountDataCleaner {

    private final StoreRepository stores;
    private final ReviewRepository reviews;
    private final ReplyRepository replies;
    private final WeeklyReportRepository reports;
    private final SupportService support;

    public AccountDataCleaner(StoreRepository stores, ReviewRepository reviews, ReplyRepository replies,
                              WeeklyReportRepository reports, SupportService support) {
        this.stores = stores;
        this.reviews = reviews;
        this.replies = replies;
        this.reports = reports;
        this.support = support;
    }

    @Transactional
    public void deleteAllOf(Long userId) {
        List<Long> storeIds = stores.findIdsByOwnerId(userId);
        if (!storeIds.isEmpty()) {
            replies.deleteByStoreIds(storeIds);
            reviews.deleteByStoreIds(storeIds);
            reports.deleteByStoreIds(storeIds);
            stores.deleteByIds(storeIds);
        }
        support.deleteAllOf(userId);
    }
}
