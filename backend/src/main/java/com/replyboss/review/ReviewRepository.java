package com.replyboss.review;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface ReviewRepository extends JpaRepository<Review, Long> {

    List<Review> findByStore_IdAndCreatedAtBetweenOrderByIdDesc(Long storeId, LocalDateTime from, LocalDateTime to);

    List<Review> findByStore_IdOrderByIdDesc(Long storeId);

    boolean existsByStore_IdAndPlatformAndMaskedContent(Long storeId, Platform platform, String maskedContent);
}
