package com.replyboss.support;

import com.replyboss.auth.AppUserRepository;
import com.replyboss.auth.MailService;
import com.replyboss.common.ApiException;
import com.replyboss.support.SupportDtos.InquiryForm;
import com.replyboss.support.SupportDtos.InquiryResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;

/** 고객 지원: 문의 접수·내 문의 조회, 관리자 처리 */
@Service
public class SupportService {

    private static final Logger log = LoggerFactory.getLogger(SupportService.class);

    private final InquiryRepository inquiries;
    private final AppUserRepository users;
    private final AttachmentStorage storage;
    private final MailService mail;

    public SupportService(InquiryRepository inquiries, AppUserRepository users, AttachmentStorage storage, MailService mail) {
        this.inquiries = inquiries;
        this.users = users;
        this.storage = storage;
        this.mail = mail;
    }

    @Transactional
    public InquiryResponse create(Long userId, InquiryForm form, MultipartFile file) {
        Inquiry inquiry = new Inquiry(users.getReferenceById(userId), form.type(), form.title().strip(), form.content().strip(),
                blankToNull(form.location()), blankToNull(form.pagePath()), blankToNull(form.errorCode()));
        if (file != null && !file.isEmpty()) {
            inquiry.attach(storage.save(file));
        }
        return InquiryResponse.of(inquiries.save(inquiry), false);
    }

    @Transactional(readOnly = true)
    public List<InquiryResponse> listMine(Long userId) {
        return inquiries.findByUser_IdOrderByIdDesc(userId).stream().map(i -> InquiryResponse.of(i, false)).toList();
    }

    @Transactional(readOnly = true)
    public InquiryResponse getMine(Long userId, Long id) {
        return InquiryResponse.of(owned(userId, id), false);
    }

    /** 첨부 이미지: 본인 문의이거나 관리자일 때만 */
    @Transactional(readOnly = true)
    public Attachment attachment(Long userId, boolean admin, Long id) {
        Inquiry i = admin ? inquiries.findById(id).orElseThrow(() -> ApiException.notFound("문의")) : owned(userId, id);
        if (i.getAttachmentPath() == null) {
            throw ApiException.notFound("첨부 파일");
        }
        return new Attachment(storage.load(i.getAttachmentPath()), i.getAttachmentType(), i.getAttachmentName());
    }

    public record Attachment(Resource resource, String contentType, String name) {
    }

    // ── 관리자 ─────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<InquiryResponse> listAll(InquiryStatus status, InquiryType type) {
        return inquiries.findAllByOrderByIdDesc().stream()
                .filter(i -> status == null || i.getStatus() == status)
                .filter(i -> type == null || i.getType() == type)
                .map(i -> InquiryResponse.of(i, true))
                .toList();
    }

    @Transactional(readOnly = true)
    public InquiryResponse getAny(Long id) {
        return InquiryResponse.of(inquiries.findById(id).orElseThrow(() -> ApiException.notFound("문의")), true);
    }

    /** 상태 변경·답변. 새 답변이면 문의자에게 메일로 알린다 (메일 설정이 없거나 실패해도 처리는 저장) */
    @Transactional
    public InquiryResponse handle(Long id, InquiryStatus status, String answer) {
        Inquiry i = inquiries.findById(id).orElseThrow(() -> ApiException.notFound("문의"));
        String before = i.getAnswer();
        i.handle(status, answer, LocalDateTime.now().truncatedTo(ChronoUnit.SECONDS));
        if (i.getAnswer() != null && !i.getAnswer().equals(before) && mail.isConfigured()) {
            try {
                mail.send(i.getUser().getEmail(), "[ReplyBoss] 문의에 답변이 등록되었습니다",
                        """
                        남겨주신 문의 "%s"에 답변이 등록되었습니다.
                        ReplyBoss > 고객 지원 > 내 문의에서 확인하실 수 있습니다.

                        %s
                        """.formatted(i.getTitle(), i.getAnswer()));
            } catch (ApiException e) {
                log.warn("답변 알림 메일 실패 (문의 {}): {}", id, e.getMessage());
            }
        }
        return InquiryResponse.of(i, true);
    }

    /** 계정 탈퇴: 문의와 첨부 파일 삭제 */
    @Transactional
    public void deleteAllOf(Long userId) {
        List<Inquiry> mine = inquiries.findByUser_IdOrderByIdDesc(userId);
        mine.forEach(i -> storage.delete(i.getAttachmentPath()));
        inquiries.deleteAll(mine);
    }

    private Inquiry owned(Long userId, Long id) {
        return inquiries.findById(id)
                .filter(i -> i.getUser().getId().equals(userId))
                .orElseThrow(() -> ApiException.notFound("문의"));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
