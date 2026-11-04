package com.replyboss.support;

import com.replyboss.auth.CurrentUser;
import com.replyboss.support.FaqService.Faq;
import com.replyboss.support.SupportDtos.AssistantRequest;
import com.replyboss.support.SupportDtos.AssistantResponse;
import com.replyboss.support.SupportDtos.InquiryForm;
import com.replyboss.support.SupportDtos.InquiryResponse;
import jakarta.validation.Valid;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/api/support")
public class SupportController {

    private final SupportService support;
    private final FaqService faqs;
    private final AssistantService assistant;
    private final CurrentUser currentUser;

    public SupportController(SupportService support, FaqService faqs, AssistantService assistant, CurrentUser currentUser) {
        this.support = support;
        this.faqs = faqs;
        this.assistant = assistant;
        this.currentUser = currentUser;
    }

    @GetMapping("/faq")
    public List<Faq> faq() {
        return faqs.all();
    }

    /** 문의 접수 (multipart/form-data: 폼 필드 + 선택 file) */
    @PostMapping(value = "/inquiries", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public InquiryResponse create(@Valid @ModelAttribute InquiryForm form,
                                  @RequestPart(value = "file", required = false) MultipartFile file) {
        return support.create(currentUser.id(), form, file);
    }

    @GetMapping("/inquiries")
    public List<InquiryResponse> mine() {
        return support.listMine(currentUser.id());
    }

    @GetMapping("/inquiries/{id}")
    public InquiryResponse one(@PathVariable Long id) {
        return support.getMine(currentUser.id(), id);
    }

    @GetMapping("/inquiries/{id}/attachment")
    public ResponseEntity<Resource> attachment(@PathVariable Long id) {
        return serve(support.attachment(currentUser.id(), currentUser.isAdmin(), id));
    }

    @PostMapping("/assistant")
    public AssistantResponse assistant(@Valid @RequestBody AssistantRequest request) {
        return assistant.answer(currentUser.id(), request);
    }

    static ResponseEntity<Resource> serve(SupportService.Attachment a) {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(a.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.inline().filename(a.name(), StandardCharsets.UTF_8).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .body(a.resource());
    }
}
