package com.replyboss.ai;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

/** AI 호출 결과를 남긴다. 기록이 실패해도 원래 작업에는 영향을 주지 않는다. */
@Service
public class AiCallRecorder {

    private static final Logger log = LoggerFactory.getLogger(AiCallRecorder.class);

    private final AiCallLogRepository logs;

    public AiCallRecorder(AiCallLogRepository logs) {
        this.logs = logs;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String kind, String model, boolean success, String errorCode, String errorMessage, long durationMs) {
        try {
            logs.save(new AiCallLog(kind == null ? "unknown" : kind, model, success, errorCode, errorMessage, durationMs,
                    LocalDateTime.now().truncatedTo(ChronoUnit.SECONDS)));
        } catch (RuntimeException e) {
            log.warn("AI 호출 기록 실패: {}", e.getMessage());
        }
    }
}
