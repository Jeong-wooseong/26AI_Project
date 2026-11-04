package com.replyboss.support;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;
import java.util.List;

public final class SupportDtos {

    private SupportDtos() {
    }

    /** 문의 접수 (multipart 폼 필드). 첨부 이미지는 별도 file 파트 */
    public record InquiryForm(
            @NotNull(message = "문의 유형을 고르십시오.") InquiryType type,
            @NotBlank(message = "제목을 입력하십시오.") @Size(max = 100, message = "제목은 100자 이내여야 합니다.") String title,
            @NotBlank(message = "상세 내용을 입력하십시오.") @Size(max = 3000, message = "상세 내용은 3000자 이내여야 합니다.") String content,
            @Size(max = 30) String location,
            @Size(max = 200) String pagePath,
            @Size(max = 50) String errorCode
    ) {
    }

    public record InquiryResponse(
            Long id,
            InquiryType type,
            String title,
            String content,
            String location,
            String pagePath,
            String errorCode,
            InquiryStatus status,
            String answer,
            LocalDateTime answeredAt,
            String attachmentName,
            Long attachmentSize,
            LocalDateTime createdAt,
            /** 관리자 화면에서만 채운다 */
            String userEmail
    ) {
        public static InquiryResponse of(Inquiry i, boolean withUser) {
            return new InquiryResponse(i.getId(), i.getType(), i.getTitle(), i.getContent(), i.getLocation(), i.getPagePath(),
                    i.getErrorCode(), i.getStatus(), i.getAnswer(), i.getAnsweredAt(), i.getAttachmentName(),
                    i.getAttachmentSize(), i.getCreatedAt(), withUser ? i.getUser().getEmail() : null);
        }
    }

    public record ChatMessage(
            @Pattern(regexp = "user|assistant") String role,
            @Size(max = 1000) String text
    ) {
    }

    public record AssistantRequest(
            @NotBlank(message = "질문을 입력하십시오.") @Size(max = 500, message = "질문은 500자 이내여야 합니다.") String message,
            @Size(max = 6) List<@Valid ChatMessage> history,
            /** 지금 보고 있는 화면 (예: reviews/wait) */
            @Pattern(regexp = "[a-z/-]{0,40}", message = "화면 정보가 올바르지 않습니다.") String page,
            /** 최근에 화면에 나온 오류 코드 (예: NETWORK, LLM_TIMEOUT) */
            @Pattern(regexp = "[A-Z0-9_]{0,40}", message = "오류 코드가 올바르지 않습니다.") String lastErrorCode
    ) {
        public AssistantRequest(String message, List<ChatMessage> history) {
            this(message, history, null, null);
        }
    }

    /**
     * @param source         AI(도우미가 FAQ 를 바탕으로 답함) | FAQ(AI 를 쓸 수 없어 FAQ 검색 결과를 그대로 보여줌)
     * @param suggestInquiry 문의 접수를 권하는지
     * @param inquiryType    권하는 문의 유형 (없으면 null)
     */
    public record AssistantResponse(String answer, List<String> faqIds, boolean suggestInquiry, InquiryType inquiryType,
                                    String source) {
    }
}
