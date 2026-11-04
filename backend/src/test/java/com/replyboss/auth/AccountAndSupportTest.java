package com.replyboss.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.replyboss.ai.EmbeddingClient;
import com.replyboss.ai.LlmClient;
import com.replyboss.ai.LlmException;
import com.replyboss.store.StoreDtos.StoreRequest;
import com.replyboss.store.StoreService;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 계정(가입·인증·로그인·재설정·탈퇴), 사용자별 데이터 분리, 고객 지원, 피드백, 관리자 권한.
 * 순서가 중요하다: 첫 가입자가 관리자가 되고 계정 없던 매장을 이어받는다.
 */
@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:accounttest;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class AccountAndSupportTest {

    static final String PW = "pass1234";
    static Long legacyStoreId;
    static Long bStoreId;
    static Long bInquiryId;

    @Autowired
    MockMvc mvc;
    @Autowired
    ObjectMapper mapper;
    @Autowired
    StoreService storeService;
    @MockitoBean
    MailService mail;
    @MockitoBean
    LlmClient llm;
    @MockitoBean
    EmbeddingClient embedding;

    private String json(Object o) throws Exception {
        return mapper.writeValueAsString(o);
    }

    private JsonNode body(MvcResult r) throws Exception {
        return mapper.readTree(r.getResponse().getContentAsString());
    }

    /** 가장 최근에 그 주소로 보낸 메일 본문에서 토큰을 꺼낸다 */
    private String lastToken(String email) {
        ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
        verify(mail, atLeastOnce()).send(eq(email), anyString(), text.capture());
        Matcher m = Pattern.compile("token=([A-Za-z0-9_-]+)").matcher(text.getValue());
        assertThat(m.find()).isTrue();
        return m.group(1);
    }

    private void signup(String email, String password) throws Exception {
        mvc.perform(post("/api/auth/signup").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", email, "password", password, "passwordConfirm", password,
                                "agreeTerms", true, "agreePrivacy", true))))
                .andExpect(status().isCreated());
    }

    private void verifyEmail(String email) throws Exception {
        mvc.perform(post("/api/auth/verify").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("token", lastToken(email)))))
                .andExpect(status().isOk());
    }

    private MockHttpSession login(String email, String password) throws Exception {
        MvcResult r = mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", email, "password", password, "remember", false))))
                .andExpect(status().isOk()).andReturn();
        return (MockHttpSession) r.getRequest().getSession(false);
    }

    @Test
    @Order(1)
    void 첫_가입자는_관리자가_되고_계정_없던_매장을_이어받는다() throws Exception {
        legacyStoreId = storeService.create(new StoreRequest("옛 매장", "카페")).id();

        mvc.perform(post("/api/auth/signup").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", "a@test.com", "password", "short", "passwordConfirm", "short",
                                "agreeTerms", true, "agreePrivacy", true))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("WEAK_PASSWORD"));
        mvc.perform(post("/api/auth/signup").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", "a@test.com", "password", PW, "passwordConfirm", PW,
                                "agreeTerms", false, "agreePrivacy", true))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("AGREEMENT_REQUIRED"));

        signup("A@Test.com", PW);
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", "a@test.com", "password", PW, "remember", false))))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("EMAIL_NOT_VERIFIED"));
        verifyEmail("a@test.com");

        MockHttpSession a = login("a@test.com", PW);
        mvc.perform(get("/api/auth/me").session(a)).andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("a@test.com")).andExpect(jsonPath("$.role").value("ADMIN"));
        mvc.perform(get("/api/stores").session(a)).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(legacyStoreId));
    }

    @Test
    @Order(2)
    void 다른_사장님의_매장과_리뷰에는_접근할_수_없다() throws Exception {
        signup("b@test.com", PW);
        verifyEmail("b@test.com");
        MockHttpSession b = login("b@test.com", PW);
        mvc.perform(get("/api/auth/me").session(b)).andExpect(jsonPath("$.role").value("USER"));

        mvc.perform(get("/api/stores").session(b)).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/stores/" + legacyStoreId).session(b)).andExpect(status().isNotFound());
        mvc.perform(get("/api/stores/" + legacyStoreId + "/reviews").session(b)).andExpect(status().isNotFound());

        MvcResult created = mvc.perform(post("/api/stores").session(b).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("name", "B 매장", "category", "카페"))))
                .andExpect(status().isCreated()).andReturn();
        bStoreId = body(created).path("id").asLong();

        MockHttpSession a = login("a@test.com", PW);
        mvc.perform(get("/api/stores/" + bStoreId).session(a)).andExpect(status().isNotFound());
        mvc.perform(get("/api/stores").session(a)).andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    @Order(3)
    void 로그인하지_않았거나_보안_토큰이_없으면_막는다() throws Exception {
        mvc.perform(get("/api/stores")).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        MockHttpSession b = login("b@test.com", PW);
        mvc.perform(post("/api/stores").session(b).contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("name", "토큰 없음", "category", "카페"))))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("CSRF"));
        mvc.perform(post("/api/auth/logout").session(b).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/stores").session(b)).andExpect(status().isUnauthorized());
    }

    @Test
    @Order(4)
    void 비밀번호를_재설정하면_새_비밀번호로만_로그인되고_링크는_한_번만_쓴다() throws Exception {
        clearInvocations(mail);
        mvc.perform(post("/api/auth/password-reset/request").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("email", "nobody@test.com")))).andExpect(status().isOk()); // 없는 계정도 같은 응답
        mvc.perform(post("/api/auth/password-reset/request").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("email", "b@test.com")))).andExpect(status().isOk());
        String token = lastToken("b@test.com");
        mvc.perform(post("/api/auth/password-reset/confirm").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("token", token, "password", "newpass99", "passwordConfirm", "different1"))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("PASSWORD_MISMATCH"));
        mvc.perform(post("/api/auth/password-reset/confirm").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("token", token, "password", "newpass99", "passwordConfirm", "newpass99"))))
                .andExpect(status().isOk());
        mvc.perform(post("/api/auth/password-reset/confirm").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("token", token, "password", "again999", "passwordConfirm", "again999"))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_TOKEN"));
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", "b@test.com", "password", PW, "remember", false))))
                .andExpect(status().isUnauthorized());
        login("b@test.com", "newpass99");
    }

    @Test
    @Order(5)
    void 비밀번호를_5번_틀리면_잠시_로그인을_막는다() throws Exception {
        signup("c@test.com", PW);
        verifyEmail("c@test.com");
        for (int i = 0; i < 5; i++) {
            mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("email", "c@test.com", "password", "wrong123", "remember", false))))
                    .andExpect(status().isUnauthorized());
        }
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", "c@test.com", "password", PW, "remember", false))))
                .andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("LOGIN_LOCKED"));
    }

    @Test
    @Order(6)
    void 문의는_이미지만_첨부되고_관리자만_답변한다() throws Exception {
        MockHttpSession b = login("b@test.com", "newpass99");
        byte[] png = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0};
        mvc.perform(multipart("/api/support/inquiries").file(new MockMultipartFile("file", "x.png", "image/png", "hello".getBytes()))
                        .param("type", "BUG").param("title", "제목").param("content", "내용").session(b).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_FILE"));
        mvc.perform(multipart("/api/support/inquiries").param("type", "BUG").param("title", "").param("content", "내용")
                        .session(b).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_INPUT"));

        MvcResult r = mvc.perform(multipart("/api/support/inquiries").file(new MockMultipartFile("file", "화면.png", "image/png", png))
                        .param("type", "BUG").param("title", "답글 생성이 끝나지 않아요").param("content", "로딩이 계속돼요")
                        .param("location", "답글 생성").param("pagePath", "#reviews/wait").param("errorCode", "LLM_TIMEOUT")
                        .session(b).with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("RECEIVED"))
                .andExpect(jsonPath("$.attachmentName").value("화면.png")).andReturn();
        bInquiryId = body(r).path("id").asLong();
        mvc.perform(get("/api/support/inquiries/" + bInquiryId + "/attachment").session(b))
                .andExpect(status().isOk()).andExpect(result -> assertThat(result.getResponse().getContentType()).isEqualTo("image/png"));
        mvc.perform(get("/api/admin/stats").session(b)).andExpect(status().isForbidden());

        MockHttpSession a = login("a@test.com", PW);
        mvc.perform(get("/api/support/inquiries/" + bInquiryId).session(a)).andExpect(status().isNotFound()); // 남의 문의 (일반 화면)
        mvc.perform(get("/api/admin/inquiries?status=RECEIVED").session(a)).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].userEmail").value("b@test.com"));
        clearInvocations(mail);
        when(mail.isConfigured()).thenReturn(true);
        mvc.perform(patch("/api/admin/inquiries/" + bInquiryId).session(a).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("answer", "확인 후 수정했습니다."))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ANSWERED"));
        verify(mail).send(eq("b@test.com"), anyString(), anyString());
        mvc.perform(get("/api/support/inquiries").session(b))
                .andExpect(jsonPath("$[0].answer").value("확인 후 수정했습니다."));
        mvc.perform(get("/api/admin/stats").session(a)).andExpect(status().isOk()).andExpect(jsonPath("$.byType.BUG").value(1));
    }

    @Test
    @Order(7)
    void 도우미는_FAQ_근거로_답하고_AI가_안되면_FAQ_검색으로_답한다() throws Exception {
        MockHttpSession b = login("b@test.com", "newpass99");
        when(llm.generateJson(any())).thenThrow(new LlmException("없음", null, "LLM_TIMEOUT"));
        mvc.perform(post("/api/support/assistant").session(b).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("message", "인증 메일이 안 와요"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.source").value("FAQ"))
                .andExpect(jsonPath("$.faqIds[0]").value("mail"));
        // AI 를 못 쓸 때도 최근 오류 코드(인터넷 끊김 등)가 있으면 그에 맞춰 안내한다
        mvc.perform(post("/api/support/assistant").session(b).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("message", "답글이 안 만들어져요", "page", "reviews/wait", "lastErrorCode", "NETWORK"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.source").value("FAQ"))
                .andExpect(jsonPath("$.answer").value(org.hamcrest.Matchers.containsString("인터넷")));

        org.mockito.Mockito.reset(llm);
        when(llm.generateJson(any())).thenReturn(mapper.readTree("""
                {"answer":"리뷰 입력 메뉴에서 세 가지 방법으로 넣을 수 있어요.","faqIds":["input","없는id"],"suggestInquiry":false,"inquiryType":"NONE"}
                """));
        mvc.perform(post("/api/support/assistant").session(b).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("message", "리뷰는 어떻게 넣어요?", "history",
                                List.of(Map.of("role", "user", "text", "안녕하세요"))))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.source").value("AI"))
                .andExpect(jsonPath("$.faqIds.length()").value(1)).andExpect(jsonPath("$.suggestInquiry").value(false));
        // 서비스 안내서와 사용자 상황을 함께 보낸다
        ArgumentCaptor<com.replyboss.ai.LlmRequest> sent = ArgumentCaptor.forClass(com.replyboss.ai.LlmRequest.class);
        verify(llm).generateJson(sent.capture());
        assertThat(sent.getValue().user()).contains("[서비스 안내서]").contains("[사용자 상황]");
    }

    @Test
    @Order(8)
    void 답글_피드백은_내_답글에만_남긴다() throws Exception {
        MockHttpSession b = login("b@test.com", "newpass99");
        MvcResult r = mvc.perform(post("/api/stores/" + bStoreId + "/reviews").session(b).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("platform", "BAEMIN", "reviews", List.of(Map.of("rating", 5, "content", ""))))))
                .andExpect(status().isCreated()).andReturn();
        long replyId = body(r).path(0).path("replies").path(0).path("id").asLong();

        mvc.perform(put("/api/replies/" + replyId + "/feedback").session(b).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("value", "DOWN", "reasons", List.of("AWKWARD_TONE", "LENGTH"), "comment", "너무 딱딱해요"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.feedback").value("DOWN"))
                .andExpect(jsonPath("$.feedbackReasons[1]").value("LENGTH"));
        MockHttpSession a = login("a@test.com", PW);
        mvc.perform(put("/api/replies/" + replyId + "/feedback").session(a).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("value", "UP")))).andExpect(status().isNotFound());
        mvc.perform(get("/api/admin/stats").session(a)).andExpect(jsonPath("$.feedbackDown").value(1))
                .andExpect(jsonPath("$.downReasons.AWKWARD_TONE").value(1));

        // 리뷰 삭제: 남의 리뷰는 404, 내 리뷰는 답글과 함께 지워진다
        long reviewId = body(r).path(0).path("id").asLong();
        mvc.perform(delete("/api/reviews/" + reviewId).session(a).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(delete("/api/reviews/" + reviewId).session(b).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/stores/" + bStoreId + "/reviews").session(b)).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @Order(9)
    void 계정을_탈퇴하면_데이터와_함께_지워진다() throws Exception {
        MockHttpSession b = login("b@test.com", "newpass99");
        mvc.perform(delete("/api/auth/account").session(b).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("password", "wrong999"))))
                .andExpect(status().isBadRequest());
        mvc.perform(delete("/api/auth/account").session(b).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("password", "newpass99"))))
                .andExpect(status().isOk());
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", "b@test.com", "password", "newpass99", "remember", false))))
                .andExpect(status().isUnauthorized());
        MockHttpSession a = login("a@test.com", PW);
        mvc.perform(get("/api/admin/inquiries").session(a)).andExpect(jsonPath("$.length()").value(0));
    }
}
