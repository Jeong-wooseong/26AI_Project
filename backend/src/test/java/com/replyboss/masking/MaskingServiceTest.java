package com.replyboss.masking;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MaskingServiceTest {

    private final MaskingService masking = new MaskingService();

    @Test
    void 휴대폰_번호를_가린다() {
        assertThat(masking.mask("010-1234-5678로 전화했는데 안 받으시네요"))
                .isEqualTo("[전화번호]로 전화했는데 안 받으시네요");
        assertThat(masking.mask("연락처 01012345678")).isEqualTo("연락처 [전화번호]");
        assertThat(masking.mask("010 1234 5678")).isEqualTo("[전화번호]");
    }

    @Test
    void 지역번호_전화를_가린다() {
        assertThat(masking.mask("매장 02-123-4567 로 연락")).isEqualTo("매장 [전화번호] 로 연락");
        assertThat(masking.mask("031-1234-5678")).isEqualTo("[전화번호]");
    }

    @Test
    void 이메일을_가린다() {
        assertThat(masking.mask("영수증은 abc.def+1@gmail.com 으로 보내주세요"))
                .isEqualTo("영수증은 [이메일] 으로 보내주세요");
    }

    @Test
    void 주문번호를_가린다() {
        assertThat(masking.mask("주문번호: B1A2C3D4E5 확인 부탁드려요"))
                .isEqualTo("주문번호 [주문번호] 확인 부탁드려요");
    }

    @Test
    void 동_호수와_도로명_주소를_가린다() {
        assertThat(masking.mask("101동 1203호로 배달 왔는데 문 앞에 두고 가셨어요"))
                .isEqualTo("[주소]로 배달 왔는데 문 앞에 두고 가셨어요");
        assertThat(masking.mask("테헤란로 123 건물 1층")).isEqualTo("[주소] 건물 1층");
    }

    @Test
    void 일반_숫자와_가격은_그대로_둔다() {
        String text = "18,000원짜리 세트 2개 시켰는데 30분 걸렸어요. 별점 5점!";
        assertThat(masking.mask(text)).isEqualTo(text);
    }

    @Test
    void 길이_들어간_일반_문장은_가리지_않는다() {
        String text = "가게 가는 길 3분이면 도착해요";
        assertThat(masking.mask(text)).isEqualTo(text);
    }

    @Test
    void 빈_값은_빈_문자열() {
        assertThat(masking.mask(null)).isEmpty();
        assertThat(masking.mask("   ")).isEmpty();
    }
}
