package com.replyboss.report;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.Optional;

public interface WeeklyReportRepository extends JpaRepository<WeeklyReport, Long> {

    Optional<WeeklyReport> findByStore_IdAndWeekStart(Long storeId, LocalDate weekStart);

    @Modifying
    @Query("delete from WeeklyReport w where w.store.id in :storeIds")
    int deleteByStoreIds(@Param("storeIds") Collection<Long> storeIds);
}
