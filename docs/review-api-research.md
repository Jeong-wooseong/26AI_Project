# 리뷰 수집: 플랫폼 공식 API 조사 (2026-10-28)

ReplyBoss 가 리뷰를 복사·파일 없이 가져올 수 있는지, **공식 문서·공식 답변**을 근거로 확인한 결과.
비공식 API 호출, 사장님 계정 로그인 세션 사용, 크롤링은 기본 구현 방식에서 제외한다.

## 요약

| 플랫폼 | 공식 리뷰 조회 API | 일반 개발자 이용 | 조건 | ReplyBoss 연동 |
| --- | --- | --- | --- | --- |
| 배달의민족 | 공개된 개발자 API·리뷰 API 문서 없음 | 불가 | 주문 연동은 제휴 POS(계약) 경로만 확인됨, 리뷰 제공 여부 미확인 | 불가 (제휴 문의 필요) |
| 쿠팡이츠 · 요기요 | 공개된 리뷰 API 문서 없음 | 불가 | 주문 연동은 POS 제휴 경로 | 불가 (제휴 문의 필요) |
| 네이버 플레이스 | 없음. 공개 검색 API(지역)는 평점·리뷰 필드 없음 | 불가 | 커머스 API 측도 "리뷰 API 제공 계획 없음"(2024-08 공식 답변) | 불가 |
| 카카오맵 | 없음. 로컬 API 는 주소·좌표·키워드/카테고리 장소 검색만 | 불가 | 쿼터·유료 정책 있음 | 불가 |
| Google 비즈니스 프로필 | **있음** (`accounts.locations.reviews.list`, 별점·리뷰 목록) | 승인 후 가능 | 인증된 비즈니스 60일 이상 운영, 웹사이트, API 접근 신청·승인(승인 전 쿼터 0), OAuth `business.manage` | 조건 충족 시 가능 (국내 배달 리뷰와는 별개) |

- 시중의 "배달앱 리뷰 API" 상품 중에는 스스로 **스크래핑 방식**이라고 밝힌 것이 있어 제외했다.

## 근거

- 네이버 검색 API(지역) 응답 필드: title, link, category, description, telephone, address, roadAddress, mapx, mapy — 평점·리뷰 필드 없음
  https://api.ncloud-docs.com/docs/naver-api-hub-search-local
- 네이버 커머스 API 리뷰 조회 요청에 대한 공식 답변(2024-08-30): 가까운 시일 내 리뷰 API 제공 계획 없음
  https://github.com/commerce-api-naver/commerce-api/discussions/1909
- 카카오 지도 REST API 공통 가이드: 주소·좌표 변환, 키워드·카테고리 장소 검색, 길찾기, 정적 지도 — 리뷰 데이터 없음, 월·일 쿼터
  https://developers.kakao.com/docs/latest/ko/local/common
- 카카오 데브톡: 장소 리뷰를 공식 API 로 조회할 수 있는지 문의, 문서에 리뷰 항목이 없다고 명시
  https://devtalk.kakao.com/t/api/150727
- 배민 사장님 공지(주문접수채널): 배민제휴POS·프랜차이즈 POS 연동 안내, 리뷰 API 언급 없음
  https://ceo.baemin.com/guide/14322
- 스크래핑 방식 배달앱 데이터 상품 예시 (계약·심사 필요)
  https://hyphen.im/product/view?seq=17
- Google Business Profile API: 리뷰 목록 엔드포인트, OAuth 범위, 인증된 위치만 가능
  https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list
- Google Business Profile API 사전 조건(접근 신청·승인, 60일 이상 운영 등)
  https://developers.google.com/my-business/content/prereqs

## 연동 시 설계 원칙 (공식 API 를 확보한 경우에만)

- 인증·토큰 처리는 서버에서만, 키·시크릿은 환경 변수(`backend/.env`), 프론트엔드에 노출 금지
- 매장 소유권 확인(플랫폼 OAuth 로 해당 매장 관리 권한 확인)
- 수집 리뷰는 기존 등록 API 흐름(마스킹 → 분류)에 연결, 플랫폼 리뷰 ID 로 중복 수집 방지
- 조회 실패·토큰 만료 시 재인증 안내, 실패분만 재시도

> 실제 인증 정보와 승인이 없으므로 가짜(Mock) API 를 실제 연동처럼 구현하지 않았다.
