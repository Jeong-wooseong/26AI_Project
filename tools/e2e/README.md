# 화면 확인용 가짜 백엔드와 자동 확인 스크립트

실제 백엔드(DB·OpenAI·메일) 없이 프런트 화면을 빠르게 확인할 때 씁니다. 결과 화면은 `shots/` 에 저장됩니다(커밋 안 함).

## 실행
```bash
# 1) 가짜 백엔드 (포트 8080: 실제 백엔드와 같은 포트이므로 둘 중 하나만 켠다)
node tools/e2e/mock.mjs
# 2) 프런트 (vite 가 /api 를 8080 으로 넘김)
cd frontend && npx vite --port 5173
# 3) 확인 스크립트 (tools/e2e 폴더에서, Python playwright 필요: pip install playwright && playwright install chromium)
cd tools/e2e && python flow22.py
```

## 파일
- `mock.mjs`: 가짜 API. 지도 검색(`/api/places/search`)은 검색어에 '끔'이 있으면 키 없음(503), '없음'이면 결과 없음. 테스트 훅 `/__reset`(데이터), `/__reset_auth`(계정), `/__admin_seed`(관리자 화면용 회원·AI 호출 기록)
- `seed.py`: `seed()` 로 계정(o@t.com / pass1234, 첫 가입이라 관리자)·매장·리뷰를 만들고 로그인. `api(method, path, body)` 로 직접 호출
- `flow16` 일괄 처리·삭제, `flow19` 리뷰 입력, `flow21` 가입·로그인·고객 지원·관리자 답변, `flow22` 오늘의 리뷰, `flow24` 주간 리포트,
  `flow25` 매장 설정, `flow26` 고객 지원, `flow27` 관리자 5탭, `flow28` 내 문의 거르기, `flow29` 주 고르기 달력, `flow30` 답글 피드백·상태 색

새 API 를 만들면 `mock.mjs` 에도 같은 모양으로 추가해야 화면 확인이 됩니다. 로그인 같은 401/403 콘솔 오류는 정상 흐름입니다.
