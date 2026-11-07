package com.replyboss.store;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class StoreProfileTest {

    @Test
    void 빈_메뉴는_버리고_공백을_정리한다() {
        StoreProfile p = new StoreProfile(
                List.of(new StoreProfile.MenuItem("  라떼 ", " 매일 아침 직접 볶은 원두 "), new StoreProfile.MenuItem(" ", "설명만")),
                true, true, false, "  ", new StoreProfile.PlaceLink("1", " 서울 ", " ")).normalized();

        assertThat(p.menus()).containsExactly(new StoreProfile.MenuItem("라떼", "매일 아침 직접 볶은 원두"));
        assertThat(p.hours()).isNull();
        assertThat(p.place()).isNull();
    }

    @Test
    void 답글에는_메뉴_이용_방법_영업시간만_넘기고_장소는_넘기지_않는다() {
        Store store = new Store("달빛카페", "카페", "주문 후 바로 만듭니다.");
        store.updateProfile(new StoreProfile(
                List.of(new StoreProfile.MenuItem("라떼", "매일 아침 직접 볶은 원두"), new StoreProfile.MenuItem("크로플", null)),
                true, true, false, "매일 10:00~21:00, 화요일 휴무",
                new StoreProfile.PlaceLink("123", "서울 마포구 어딘가 1", "http://place.map.kakao.com/123")));

        assertThat(store.replyInfo()).isEqualTo("""
                소개·운영 방식: 주문 후 바로 만듭니다.
                대표 메뉴: 라떼(매일 아침 직접 볶은 원두), 크로플
                이용 방법: 배달, 포장 가능
                영업시간: 매일 10:00~21:00, 화요일 휴무""");
        assertThat(store.replyInfo()).doesNotContain("마포구").doesNotContain("kakao");
        assertThat(store.profile().place().url()).isEqualTo("http://place.map.kakao.com/123");
    }

    @Test
    void 적은_것이_없으면_매장_정보는_없음() {
        Store store = new Store("달빛카페", "카페");
        assertThat(store.replyInfo()).isNull();
        assertThat(store.profile()).isEqualTo(StoreProfile.EMPTY);
    }
}
