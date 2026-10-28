package com.replyboss.reply;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ReplyTemplateRepository extends JpaRepository<ReplyTemplate, Long> {

    List<ReplyTemplate> findByRatingMinLessThanEqualAndRatingMaxGreaterThanEqualAndFormality(
            int rating, int sameRating, String formality);
}
