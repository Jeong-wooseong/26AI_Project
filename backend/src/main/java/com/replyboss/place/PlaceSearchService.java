package com.replyboss.place;

import com.fasterxml.jackson.databind.JsonNode;
import com.replyboss.common.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * 카카오 로컬 키워드 검색(공식 API)으로 음식점·카페를 찾는다.
 * 화면에는 이름·업종·주소·카카오맵 링크만 돌려주고, 전화번호 등 다른 값은 받지도 저장하지도 않는다.
 * 메뉴·영업시간은 이 API 에 없으므로 사장님이 직접 적는다.
 */
@Service
public class PlaceSearchService {

    private static final Logger log = LoggerFactory.getLogger(PlaceSearchService.class);

    /** 카카오 장소 분류: FD6 음식점, CE7 카페 */
    private static final Set<String> FOOD_GROUPS = Set.of("FD6", "CE7");
    private static final int MAX_RESULTS = 10;
    private static final int MAX_QUERY = 50;

    public record Place(String id, String name, String category, String categoryPath, String address, String url) {
    }

    private final KakaoProperties props;
    private final RestClient restClient;

    public PlaceSearchService(KakaoProperties props) {
        this.props = props;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(Duration.ofSeconds(5));
        this.restClient = RestClient.builder()
                .baseUrl(props.baseUrl() == null || props.baseUrl().isBlank() ? "https://dapi.kakao.com" : props.baseUrl())
                .requestFactory(factory)
                .build();
    }

    public List<Place> search(String query) {
        if (!props.hasKey()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "PLACE_SEARCH_OFF",
                    "지도 검색이 아직 설정되지 않았습니다. 매장명과 업종을 직접 입력하십시오.");
        }
        String q = query == null ? "" : query.strip();
        if (q.length() < 2) {
            throw ApiException.badRequest("QUERY_TOO_SHORT", "매장 이름을 두 글자 이상 입력하십시오.");
        }
        String trimmed = q.length() > MAX_QUERY ? q.substring(0, MAX_QUERY) : q;
        try {
            JsonNode body = restClient.get()
                    .uri(b -> b.path("/v2/local/search/keyword.json")
                            .queryParam("query", trimmed)
                            .queryParam("size", 15)
                            .build())
                    .header("Authorization", "KakaoAK " + props.restApiKey())
                    .retrieve()
                    .body(JsonNode.class);
            return parse(body);
        } catch (RestClientResponseException e) {
            log.warn("카카오 장소 검색 실패: {} {}", e.getStatusCode().value(), e.getResponseBodyAsString());
            if (e.getStatusCode().value() == 401 || e.getStatusCode().value() == 403) {
                throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "PLACE_SEARCH_KEY",
                        "지도 검색 설정을 확인해야 합니다. 매장명과 업종을 직접 입력하십시오.");
            }
            throw new ApiException(HttpStatus.BAD_GATEWAY, "PLACE_SEARCH_FAILED",
                    "지도 검색에 실패했습니다. 잠시 후 다시 시도하십시오.");
        } catch (RestClientException e) {
            log.warn("카카오 장소 검색 연결 실패: {}", e.getMessage());
            throw new ApiException(HttpStatus.BAD_GATEWAY, "PLACE_SEARCH_FAILED",
                    "지도 검색에 연결하지 못했습니다. 잠시 후 다시 시도하십시오.");
        }
    }

    /** 카카오 응답에서 음식점·카페만 골라 최대 10개 */
    static List<Place> parse(JsonNode body) {
        List<Place> out = new ArrayList<>();
        if (body == null) {
            return out;
        }
        for (JsonNode d : body.path("documents")) {
            if (!FOOD_GROUPS.contains(d.path("category_group_code").asText())) {
                continue;
            }
            String road = d.path("road_address_name").asText("");
            String path = d.path("category_name").asText("");
            out.add(new Place(
                    d.path("id").asText(),
                    d.path("place_name").asText(),
                    toCategory(path),
                    path,
                    road.isBlank() ? d.path("address_name").asText("") : road,
                    d.path("place_url").asText("")));
            if (out.size() >= MAX_RESULTS) {
                break;
            }
        }
        return out;
    }

    /** 카카오 분류(예: "음식점 > 카페 > 디저트카페")를 화면의 업종 목록으로 바꾼다 */
    static String toCategory(String path) {
        String p = path == null ? "" : path;
        if (p.contains("디저트") || p.contains("제과") || p.contains("베이커리") || p.contains("아이스크림")
                || p.contains("도넛") || p.contains("떡,한과")) {
            return "디저트";
        }
        if (p.contains("카페")) {
            return "카페";
        }
        for (String c : List.of("치킨", "피자", "분식", "중식", "일식", "양식", "한식")) {
            if (p.contains(c)) {
                return c;
            }
        }
        return "기타";
    }
}
