package com.replyboss.admin;

import com.replyboss.auth.CurrentUser;
import com.replyboss.support.InquiryStatus;
import com.replyboss.support.InquiryType;
import com.replyboss.support.SupportDtos.InquiryResponse;
import com.replyboss.support.SupportService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.List;

/** 관리자 전용 (/api/admin/** 은 SecurityConfig 에서 ADMIN 만 허용) */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final SupportService support;
    private final AdminService admin;
    private final CurrentUser currentUser;

    public AdminController(SupportService support, AdminService admin, CurrentUser currentUser) {
        this.support = support;
        this.admin = admin;
        this.currentUser = currentUser;
    }

    public record HandleRequest(InquiryStatus status, @Size(max = 3000, message = "답변은 3000자 이내여야 합니다.") String answer) {
    }

    @GetMapping("/inquiries")
    public List<InquiryResponse> inquiries(@RequestParam(required = false) InquiryStatus status,
                                           @RequestParam(required = false) InquiryType type) {
        return support.listAll(status, type);
    }

    @GetMapping("/inquiries/{id}")
    public InquiryResponse inquiry(@PathVariable Long id) {
        return support.getAny(id);
    }

    @PatchMapping("/inquiries/{id}")
    public InquiryResponse handle(@PathVariable Long id, @Valid @RequestBody HandleRequest request) {
        return support.handle(id, request.status(), request.answer());
    }

    @GetMapping("/inquiries/{id}/attachment")
    public ResponseEntity<Resource> attachment(@PathVariable Long id) {
        SupportService.Attachment a = support.attachment(currentUser.id(), true, id);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(a.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.inline().filename(a.name(), StandardCharsets.UTF_8).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .body(a.resource());
    }

    @GetMapping("/stats")
    public AdminService.Stats stats() {
        return admin.stats();
    }
}
