package com.replyboss.store;

import com.replyboss.common.JsonText;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;
import java.util.List;

public final class StoreDtos {

    private StoreDtos() {
    }

    public record StoreRequest(
            @NotBlank(message = "가게 이름을 입력해주세요.")
            @Size(max = 100, message = "가게 이름은 100자 이내로 입력해주세요.")
            String name,
            @Size(max = 50, message = "업종은 50자 이내로 입력해주세요.")
            String category
    ) {
    }

    public record ToneExtractRequest(
            @NotNull(message = "예시 답글을 입력해주세요.")
            @Size(min = 3, max = 5, message = "예시 답글은 3~5개 입력해주세요.")
            List<@NotBlank(message = "비어 있는 예시 답글이 있어요.") String> sampleReplies
    ) {
    }

    public record ToneUpdateRequest(
            @NotNull(message = "톤 프로필이 없어요.") @Valid ToneProfile toneProfile,
            List<String> sampleReplies
    ) {
    }

    public record StoreResponse(
            Long id,
            String name,
            String category,
            ToneProfile toneProfile,
            List<String> sampleReplies,
            LocalDateTime updatedAt
    ) {
        public static StoreResponse from(Store store) {
            return new StoreResponse(
                    store.getId(),
                    store.getName(),
                    store.getCategory(),
                    JsonText.read(store.getToneProfile(), ToneProfile.class),
                    JsonText.readStringList(store.getSampleReplies()),
                    store.getUpdatedAt()
            );
        }
    }
}
