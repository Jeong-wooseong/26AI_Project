# ReplyBoss

소상공인(음식점·카페) 사장님이 배달앱·지도 리뷰를 붙여 넣으면 개인정보를 가리고, 분류하고, 사장님 말투로 답글 초안을 만들어 주는 웹앱. 대학 "생성형 AI 활용" 수업 프로젝트(GitHub `Jeong-wooseong/26AI_Project`, 작업 브랜치 `week1-2`).

## 대화 방식
- 한국어로, 짧게. 오류·버그는 먼저 짚는다. 사용자가 구체적으로 지적한 것만 고치고, 한 단계씩 확인받으며 진행한다.
- 커밋 메시지는 한국어로 무엇을 바꿨는지 쓴다. `git remote set-url` 은 하지 않는다.

## 구조와 실행
- `backend/`: Spring Boot 3.5, Java 17, JPA(`ddl-auto: update`), Spring Security 세션 + 로그인 유지 토큰 + CSRF 쿠키, OpenAI 구조화 JSON. 로컬은 H2(`local` 프로필).
  - 설정은 `backend/.env`(커밋 금지, 사용자가 직접 편집). 예시는 `backend/.env.example`.
  - 테스트: `cd backend && ./mvnw test` (CI: GitHub Actions 가 push 마다 실행)
  - 프롬프트는 `src/main/resources/prompts/*_vN.txt`. 프롬프트를 바꾸면 새 버전 파일을 만들고 서비스의 `PROMPT` 상수와 README 를 함께 올린다 (현재 답글 생성 `reply_generate_v10`, 주간 리포트 `weekly_report_v3`).
- `frontend/`: React 18 + Vite, 해시 라우트(`#reviews`, `#report`, `#setup`, `#support/mine`, `#admin/users` …). `npm run dev` (5173, `/api` → 8080). `npx vite build` 로 빌드 확인.
- `tools/e2e/`: 실제 백엔드 없이 화면을 확인하는 가짜 API(`mock.mjs`, 8080)와 Playwright 확인 스크립트. 새 API 를 만들면 mock 에도 추가. 자세한 건 `tools/e2e/README.md`.
- `eval/`: 프롬프트 평가 스크립트와 결과.

## 반드시 지킬 것
- 개인정보(전화·주소·이름 등)는 AI 호출 전에 가린다. 관리자 화면에도 가린 리뷰 본문만 보인다.
- 배달앱·지도에 자동 게시하지 않는다. "작성 완료" 는 게시가 아니다 (사장님이 복사해 직접 올림).
- 비공식 API, 크롤링, 사용자 로그인 세션을 이용한 수집은 하지 않는다. 지도 연동은 카카오 로컬 같은 공식 장소 검색 API 로 매장 정보만(추후 과제).
- 없는 기능·가짜 수치·가짜 보안 표시(동기화 상태, PRO 요금제, 인증 배지 등)를 화면에 넣지 않는다. 결제 기능은 없다.
- 기존 기능을 지우지 않는다. 리디자인 때도 기능이 빠지지 않았는지 확인한다.
- 한 페이지에 같은 수치·데이터는 한 번만 보여 준다.
- API 키·비밀번호를 대신 파일이나 입력란에 넣지 않는다.

## 디자인 (Figma 시안 기준, `frontend/src/styles.css`)
- 색: primary `#244bd6`(hover `#1d3fb8`, tint `#e9eeff`), navy `#17316b`, 본문 `#18243a`, 배경 `#f3f6fc`, 보조면 `#fbfcfe`, 테두리 `#dce3ef`/`#e7ebf2`, 별 `#f1a530`. radius 10px / 7px. 글꼴 Pretendard, 최소 12px.
- 상태 색: 완료 초록(`--st-done`), 대기 노랑(`--st-wait`), 진행 중·작성 전 주황(`--st-doing`), 실패 빨강(`--st-fail`). 색만으로 구분하지 않고 글자·아이콘을 함께 쓴다.
- 진행률 막대·숫자는 `src/progressColor.js` 로 비율에 따라 빨강→주황→노랑→초록.
- 차트 색: 긍정 `#2a9d72`, 불만 `#c2620a`, 기타 `#d5dce8`, 이번 주 primary, 지난주 `#9ba7b8`.
- 사장님 화면에는 마스코트를 쓰고, 관리자 화면은 마스코트 없이 표 중심으로 촘촘하게.
- 문구는 사장님이 알아듣는 말로, 버튼은 무슨 일이 일어나는지 그대로("답글 스타일 저장", "이용 중지").

## 주요 기능 위치
- 오늘의 리뷰 `pages/ReviewList.jsx` (목록+상세 2단, 답글 초안 `components/reply/ReplyDraftPanel.jsx`, 완료 카드 `FinalReply.jsx`)
- 리뷰 입력 `pages/ReviewInput.jsx` (임시 저장), 주간 리포트 `pages/WeeklyReport.jsx`, 매장 설정 `pages/StoreSetup.jsx`(학습한 말투를 바로 고치고, 기본 설정은 기본 말투·중복 방지)
- 고객 지원 `pages/Support.jsx` + 도우미 `components/HelpChat.jsx`, 로그인·가입 `pages/Auth.jsx`
- 관리자 `pages/Admin.jsx`: 대시보드·회원 관리(이용 중지)·문의 관리·답글 피드백·서비스 모니터링(AI 호출 기록)·운영 통계. 첫 가입 계정이 관리자.

## 알려진 한계·남은 일
- 답글 길이: 프롬프트 v10 으로 강화했지만 실제 OpenAI 로는 아직 확인 못 함. 계속 짧으면 "길이만 맞춰 고치기" 추가 호출을 검토.
- 매장 설정의 학습 결과 미리보기 문장은 AI 가 아니라 틀로 만든 예시.
- 이름 칸이 생기기 전에 가입한 계정은 이름이 비어 있다 (이름 수정 화면 없음).
- 리뷰 유형 "불만" 배지(주황)가 상태 주황과 비슷해 보일 수 있음.
