package com.replyboss.place;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 매장 설정에서 지도로 매장 찾기 (로그인한 사장님만) */
@RestController
@RequestMapping("/api/places")
public class PlaceController {

    private final PlaceSearchService placeSearchService;

    public PlaceController(PlaceSearchService placeSearchService) {
        this.placeSearchService = placeSearchService;
    }

    @GetMapping("/search")
    public List<PlaceSearchService.Place> search(@RequestParam(defaultValue = "") String query) {
        return placeSearchService.search(query);
    }
}
