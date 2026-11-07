package com.replyboss.place;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.replyboss.common.ApiException;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PlaceSearchServiceTest {

    @Test
    void 카카오_분류를_화면_업종으로_바꾼다() {
        assertThat(PlaceSearchService.toCategory("음식점 > 카페 > 커피전문점")).isEqualTo("카페");
        assertThat(PlaceSearchService.toCategory("음식점 > 카페 > 디저트카페")).isEqualTo("디저트");
        assertThat(PlaceSearchService.toCategory("음식점 > 간식 > 제과,베이커리")).isEqualTo("디저트");
        assertThat(PlaceSearchService.toCategory("음식점 > 양식 > 피자")).isEqualTo("피자");
        assertThat(PlaceSearchService.toCategory("음식점 > 치킨 > 교촌치킨")).isEqualTo("치킨");
        assertThat(PlaceSearchService.toCategory("음식점 > 한식 > 육류,고기")).isEqualTo("한식");
        assertThat(PlaceSearchService.toCategory("음식점 > 패스트푸드")).isEqualTo("기타");
    }

    @Test
    void 음식점과_카페만_고르고_전화번호는_버린다() throws Exception {
        var body = new ObjectMapper().readTree("""
                {"documents":[
                  {"id":"1","place_name":"달빛카페","category_name":"음식점 > 카페","category_group_code":"CE7",
                   "phone":"02-000-0000","address_name":"서울 마포구 1","road_address_name":"서울 마포구 길 1",
                   "place_url":"http://place.map.kakao.com/1"},
                  {"id":"2","place_name":"달빛주차장","category_name":"교통 > 주차장","category_group_code":"PK6",
                   "address_name":"서울 마포구 2","road_address_name":"","place_url":"http://place.map.kakao.com/2"},
                  {"id":"3","place_name":"달빛분식","category_name":"음식점 > 분식","category_group_code":"FD6",
                   "address_name":"서울 마포구 3","road_address_name":"","place_url":"http://place.map.kakao.com/3"}
                ]}""");

        List<PlaceSearchService.Place> places = PlaceSearchService.parse(body);

        assertThat(places).extracting(PlaceSearchService.Place::name).containsExactly("달빛카페", "달빛분식");
        assertThat(places.get(0).address()).isEqualTo("서울 마포구 길 1");
        assertThat(places.get(1).address()).isEqualTo("서울 마포구 3");
        assertThat(places.get(1).category()).isEqualTo("분식");
        assertThat(places.toString()).doesNotContain("02-000-0000");
    }

    @Test
    void 키가_없으면_검색을_막는다() {
        var service = new PlaceSearchService(new KakaoProperties("", null));
        assertThatThrownBy(() -> service.search("달빛카페"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("직접 입력");
    }
}
