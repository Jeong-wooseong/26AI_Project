package com.replyboss.store;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.ArrayList;
import java.util.List;

/**
 * 사장님이 적은 메뉴·이용 방법·영업시간과, 지도에서 찾아 연결한 장소.
 * 답글에는 메뉴·이용 방법·영업시간만 [확인된 매장 정보]로 넘긴다 (장소 주소·링크는 화면 표시용, AI 에 보내지 않음).
 *
 * @param menus    대표 메뉴 (최대 10개)
 * @param delivery 배달 가능
 * @param takeout  포장 가능
 * @param dineIn   매장 식사 가능
 * @param hours    영업시간 (자유 입력, 예: 매일 11:00~21:00, 화요일 휴무)
 * @param place    카카오맵에서 찾아 연결한 장소 (없으면 null)
 */
public record StoreProfile(
        @Size(max = 10, message = "대표 메뉴는 10개까지 넣을 수 있습니다.")
        List<@Valid MenuItem> menus,
        boolean delivery,
        boolean takeout,
        boolean dineIn,
        @Size(max = 100, message = "영업시간은 100자 이내여야 합니다.")
        String hours,
        @Valid PlaceLink place
) {

    public static final StoreProfile EMPTY = new StoreProfile(List.of(), false, false, false, null, null);

    public record MenuItem(
            @NotBlank(message = "메뉴 이름을 입력하십시오.")
            @Size(max = 30, message = "메뉴 이름은 30자 이내여야 합니다.")
            String name,
            @Size(max = 100, message = "메뉴 설명은 100자 이내여야 합니다.")
            String description
    ) {
    }

    /** 카카오맵 장소. 링크는 카카오맵 장소 페이지 주소만 받는다 */
    public record PlaceLink(
            @Size(max = 30) String id,
            @Size(max = 200) String address,
            @Pattern(regexp = "^https?://place\\.map\\.kakao\\.com/\\d+$", message = "카카오맵 장소 링크가 아닙니다.")
            String url
    ) {
    }

    /** 앞뒤 공백을 지우고 빈 메뉴·빈 값을 정리한다 */
    public StoreProfile normalized() {
        List<MenuItem> cleaned = new ArrayList<>();
        for (MenuItem m : menus == null ? List.<MenuItem>of() : menus) {
            if (m == null || m.name() == null || m.name().isBlank()) {
                continue;
            }
            cleaned.add(new MenuItem(m.name().strip(), blankToNull(m.description())));
        }
        PlaceLink p = place == null || place.url() == null || place.url().isBlank() ? null
                : new PlaceLink(blankToNull(place.id()), blankToNull(place.address()), place.url().strip());
        return new StoreProfile(List.copyOf(cleaned), delivery, takeout, dineIn, blankToNull(hours), p);
    }

    /** 답글 프롬프트의 [확인된 매장 정보]에 넣을 줄들. 적은 것이 없으면 빈 목록 */
    public List<String> replyLines() {
        List<String> lines = new ArrayList<>();
        if (menus != null && !menus.isEmpty()) {
            List<String> items = menus.stream()
                    .map(m -> m.description() == null ? m.name() : m.name() + "(" + m.description() + ")")
                    .toList();
            lines.add("대표 메뉴: " + String.join(", ", items));
        }
        List<String> ways = new ArrayList<>();
        if (delivery) {
            ways.add("배달");
        }
        if (takeout) {
            ways.add("포장");
        }
        if (dineIn) {
            ways.add("매장 식사");
        }
        if (!ways.isEmpty()) {
            lines.add("이용 방법: " + String.join(", ", ways) + " 가능");
        }
        if (hours != null && !hours.isBlank()) {
            lines.add("영업시간: " + hours.strip());
        }
        return lines;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
