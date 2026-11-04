package com.replyboss.support;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface InquiryRepository extends JpaRepository<Inquiry, Long> {

    List<Inquiry> findByUser_IdOrderByIdDesc(Long userId);

    List<Inquiry> findAllByOrderByIdDesc();
}
