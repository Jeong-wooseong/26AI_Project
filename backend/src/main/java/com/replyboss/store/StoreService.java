package com.replyboss.store;

import com.replyboss.common.ApiException;
import com.replyboss.common.JsonText;
import com.replyboss.store.StoreDtos.StoreRequest;
import com.replyboss.store.StoreDtos.StoreResponse;
import com.replyboss.store.StoreDtos.ToneUpdateRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class StoreService {

    private final StoreRepository storeRepository;

    public StoreService(StoreRepository storeRepository) {
        this.storeRepository = storeRepository;
    }

    @Transactional
    public StoreResponse create(StoreRequest request) {
        Store store = storeRepository.save(new Store(request.name().trim(), trimOrNull(request.category())));
        return StoreResponse.from(store);
    }

    @Transactional(readOnly = true)
    public List<StoreResponse> findAll() {
        return storeRepository.findAll().stream().map(StoreResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public StoreResponse findOne(Long id) {
        return StoreResponse.from(get(id));
    }

    @Transactional
    public StoreResponse update(Long id, StoreRequest request) {
        Store store = get(id);
        store.rename(request.name().trim(), trimOrNull(request.category()));
        return StoreResponse.from(store);
    }

    @Transactional
    public StoreResponse updateTone(Long id, ToneUpdateRequest request) {
        Store store = get(id);
        ToneProfile tone = request.toneProfile();
        validate(tone);
        String samples = request.sampleReplies() == null ? null : JsonText.write(
                request.sampleReplies().stream().map(String::trim).filter(s -> !s.isEmpty()).toList());
        store.updateTone(JsonText.write(tone), samples);
        return StoreResponse.from(store);
    }

    public Store get(Long id) {
        return storeRepository.findById(id).orElseThrow(() -> ApiException.notFound("가게"));
    }

    private void validate(ToneProfile tone) {
        if (!ToneProfile.FORMALITIES.contains(tone.formality())) {
            throw ApiException.badRequest("INVALID_TONE", "존댓말 수준은 " + ToneProfile.FORMALITIES + " 중 하나여야 해요.");
        }
        if (!ToneProfile.EMOJI_LEVELS.contains(tone.emojiLevel())) {
            throw ApiException.badRequest("INVALID_TONE", "이모지 빈도는 " + ToneProfile.EMOJI_LEVELS + " 중 하나여야 해요.");
        }
        if (!ToneProfile.LENGTHS.contains(tone.length())) {
            throw ApiException.badRequest("INVALID_TONE", "문장 길이는 " + ToneProfile.LENGTHS + " 중 하나여야 해요.");
        }
        if (tone.phrases().size() > 8) {
            throw ApiException.badRequest("INVALID_TONE", "자주 쓰는 표현은 8개까지 저장할 수 있어요.");
        }
    }

    private static String trimOrNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
