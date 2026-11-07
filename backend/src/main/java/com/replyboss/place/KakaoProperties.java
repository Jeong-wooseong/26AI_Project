package com.replyboss.place;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * application.yml 의 kakao.* 설정. REST API 키는 backend/.env 의 KAKAO_REST_API_KEY 로만 넣는다.
 * 카카오 로컬(장소 검색) 공식 API 만 쓰며, 매장 이름·업종·주소·장소 링크만 받는다.
 */
@ConfigurationProperties(prefix = "kakao")
public record KakaoProperties(String restApiKey, String baseUrl) {

    public boolean hasKey() {
        return restApiKey != null && !restApiKey.isBlank();
    }
}
