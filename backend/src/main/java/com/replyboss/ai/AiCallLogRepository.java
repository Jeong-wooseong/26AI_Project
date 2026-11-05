package com.replyboss.ai;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface AiCallLogRepository extends JpaRepository<AiCallLog, Long> {

    List<AiCallLog> findByCreatedAtAfter(LocalDateTime after);

    List<AiCallLog> findBySuccessFalseOrderByIdDesc(Pageable page);

    List<AiCallLog> findAllByOrderByIdDesc(Pageable page);

    Optional<AiCallLog> findFirstByOrderByIdAsc();

    Optional<AiCallLog> findFirstBySuccessTrueOrderByIdDesc();

    Optional<AiCallLog> findFirstBySuccessFalseOrderByIdDesc();
}
