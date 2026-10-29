package com.replyboss.report;

import com.replyboss.report.ReportDtos.ReportResponse;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

@RestController
public class ReportController {

    private final ReportService reportService;

    public ReportController(ReportService reportService) {
        this.reportService = reportService;
    }

    /** 주간 리포트: week 는 그 주의 아무 날짜 (없으면 이번 주). 수치는 매번 집계, AI 요약은 저장된 것만 */
    @GetMapping("/api/stores/{storeId}/reports")
    public ReportResponse report(@PathVariable Long storeId,
                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate week) {
        return reportService.report(storeId, week == null ? LocalDate.now() : week);
    }

    /** AI 요약·개선 제안 만들기 (다시 부르면 새로 만듦) */
    @PostMapping("/api/stores/{storeId}/reports/insight")
    public ReportResponse insight(@PathVariable Long storeId,
                                  @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate week) {
        return reportService.generateInsight(storeId, week == null ? LocalDate.now() : week);
    }
}
