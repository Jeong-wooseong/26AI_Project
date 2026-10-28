package com.replyboss.store;

import com.replyboss.store.StoreDtos.StoreRequest;
import com.replyboss.store.StoreDtos.StoreResponse;
import com.replyboss.store.StoreDtos.ToneExtractRequest;
import com.replyboss.store.StoreDtos.ToneUpdateRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/stores")
public class StoreController {

    private final StoreService storeService;
    private final ToneProfileService toneProfileService;

    public StoreController(StoreService storeService, ToneProfileService toneProfileService) {
        this.storeService = storeService;
        this.toneProfileService = toneProfileService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public StoreResponse create(@Valid @RequestBody StoreRequest request) {
        return storeService.create(request);
    }

    @GetMapping
    public List<StoreResponse> list() {
        return storeService.findAll();
    }

    @GetMapping("/{id}")
    public StoreResponse get(@PathVariable Long id) {
        return storeService.findOne(id);
    }

    @PutMapping("/{id}")
    public StoreResponse update(@PathVariable Long id, @Valid @RequestBody StoreRequest request) {
        return storeService.update(id, request);
    }

    /** 예시 답글로 톤을 뽑아 돌려준다. 저장하지 않으며, 사장님이 고친 뒤 PUT .../tone-profile 로 저장한다. */
    @PostMapping("/{id}/tone-profile/extract")
    public ToneProfile extractTone(@PathVariable Long id, @Valid @RequestBody ToneExtractRequest request) {
        storeService.get(id);
        return toneProfileService.extract(request.sampleReplies());
    }

    @PutMapping("/{id}/tone-profile")
    public StoreResponse updateTone(@PathVariable Long id, @Valid @RequestBody ToneUpdateRequest request) {
        return storeService.updateTone(id, request);
    }
}
