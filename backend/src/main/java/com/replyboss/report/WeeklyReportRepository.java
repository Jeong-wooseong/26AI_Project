package com.replyboss.report;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.Optional;

public interface WeeklyReportRepository extends JpaRepository<WeeklyReport, Long> {

    Optional<WeeklyReport> findByStore_IdAndWeekStart(Long storeId, LocalDate weekStart);
}
