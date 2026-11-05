// 백엔드 API 호출. 오류는 { code, message } 를 담은 ApiError 로 던진다.

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// 최근에 화면에 나온 오류 (도우미가 '방금 무슨 오류였는지' 참고). 10분 지나면 버린다
let lastError = null;
export function recentErrorCode() {
  return lastError && Date.now() - lastError.at < 10 * 60 * 1000 ? lastError.code : null;
}
function remember(err) {
  if (err.code && err.code !== 'UNKNOWN') lastError = { code: err.code, at: Date.now() };
  return err;
}

// 로그인이 풀렸을 때(401) 앱이 로그인 화면을 보여주도록 알린다
let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

// CSRF: 서버가 내려준 XSRF-TOKEN 쿠키 값을 헤더로 돌려보낸다 (GET 이외 요청)
function csrfToken() {
  const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function request(method, path, body, { retried = false, quiet401 = false } = {}) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers = {};
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    const token = csrfToken();
    if (token) headers['X-XSRF-TOKEN'] = token;
  }
  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw remember(new ApiError('NETWORK', '서버에 연결할 수 없습니다. 인터넷 연결과 서버 상태를 확인하십시오.', 0));
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // 백엔드가 꺼져 있으면 개발 서버 프록시가 JSON 이 아닌 오류를 돌려준다
    throw remember(new ApiError('NETWORK', '서버에 연결할 수 없습니다. 인터넷 연결과 서버 상태를 확인하십시오.', res.status));
  }
  if (!res.ok) {
    // 보안 토큰이 없거나 바뀐 경우: 토큰을 새로 받고 한 번만 다시 시도
    if (res.status === 403 && data?.code === 'CSRF' && !retried) {
      await fetch('/api/auth/me', { credentials: 'same-origin' }).catch(() => {});
      return request(method, path, body, { retried: true, quiet401 });
    }
    if (res.status === 401 && !quiet401 && onUnauthorized) onUnauthorized();
    const err = new ApiError(data?.code ?? 'UNKNOWN', data?.message ?? `요청 실패 (${res.status})`, res.status);
    if (!quiet401) remember(err);
    throw err;
  }
  return data;
}

export const api = {
  listStores: () => request('GET', '/api/stores'),
  createStore: (body) => request('POST', '/api/stores', body),
  updateStore: (id, body) => request('PUT', `/api/stores/${id}`, body),
  updateReplySettings: (id, settings) => request('PUT', `/api/stores/${id}/reply-settings`, settings),
  extractTone: (id, sampleReplies) => request('POST', `/api/stores/${id}/tone-profile/extract`, { sampleReplies }),
  saveTone: (id, toneProfile, sampleReplies) =>
    request('PUT', `/api/stores/${id}/tone-profile`, { toneProfile, sampleReplies }),

  createReviews: (storeId, platform, reviews) =>
    request('POST', `/api/stores/${storeId}/reviews`, { platform, reviews }),
  // 일괄 등록 전 중복 확인 (저장하지 않음). items: [{ platform, content }]
  checkDuplicates: (storeId, items) => request('POST', `/api/stores/${storeId}/reviews/duplicate-check`, { items }),
  listReviews: (storeId, { date, type } = {}) => {
    const q = new URLSearchParams();
    if (date) q.set('date', date);
    if (type) q.set('type', type);
    const qs = q.toString();
    return request('GET', `/api/stores/${storeId}/reviews${qs ? `?${qs}` : ''}`);
  },
  // 답글 초안 3종 생성 (다시 부르면 초안을 새로 바꿈. 최종 확정한 답글은 유지)
  generateReplies: (reviewId) => request('POST', `/api/reviews/${reviewId}/replies`),
  // 작성 완료: 답글 하나를 최종 확정 (확정한 답글 수정에도 사용). 외부 플랫폼에는 게시하지 않음
  // confirmed: 악성 리뷰 대응 답글은 사장님 확인(true)이 있어야 확정됨
  completeReply: (reviewId, replyId, content, confirmed = false) =>
    request('PUT', `/api/reviews/${reviewId}/final-reply`, { replyId, content, confirmed }),
  // 악성 리뷰 대응 가이드 (strategy: APOLOGY | FACT | HOLD, 없으면 추천)
  maliciousGuide: (reviewId, strategy) =>
    request('POST', `/api/reviews/${reviewId}/malicious-guide`, strategy ? { strategy } : {}),
  // 주간 리포트 (week: 그 주의 아무 날짜 YYYY-MM-DD). 수치는 서버 집계, AI 요약은 저장된 것만
  weeklyReport: (storeId, week) => request('GET', `/api/stores/${storeId}/reports?week=${week}`),
  generateInsight: (storeId, week) => request('POST', `/api/stores/${storeId}/reports/insight?week=${week}`),
  reclassify: (reviewId) => request('POST', `/api/reviews/${reviewId}/classify`),
  // 리뷰 삭제 (초안·최종 답글도 함께 지워짐)
  deleteReview: (reviewId) => request('DELETE', `/api/reviews/${reviewId}`),
  // 답글 피드백 (value: UP | DOWN | null 취소, reasons: FeedbackReason 목록)
  replyFeedback: (replyId, value, reasons = [], comment = '') =>
    request('PUT', `/api/replies/${replyId}/feedback`, { value, reasons, comment }),
};

export const auth = {
  // 로그인하지 않았으면 null
  me: async () => {
    try {
      return await request('GET', '/api/auth/me', undefined, { quiet401: true });
    } catch (e) {
      if (e.status === 401) return null;
      throw e;
    }
  },
  signup: (body) => request('POST', '/api/auth/signup', body),
  verify: (token) => request('POST', '/api/auth/verify', { token }),
  resendVerification: (email) => request('POST', '/api/auth/resend-verification', { email }),
  login: (email, password, remember) =>
    request('POST', '/api/auth/login', { email, password, remember }, { quiet401: true }),
  logout: () => request('POST', '/api/auth/logout'),
  requestReset: (email) => request('POST', '/api/auth/password-reset/request', { email }),
  confirmReset: (token, password, passwordConfirm) =>
    request('POST', '/api/auth/password-reset/confirm', { token, password, passwordConfirm }),
  deleteAccount: (password) => request('DELETE', '/api/auth/account', { password }, { quiet401: true }),
};

export const support = {
  faq: () => request('GET', '/api/support/faq'),
  // form: { type, title, content, location, pagePath, errorCode }, file: 이미지(선택)
  createInquiry: (form, file) => {
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (v != null && v !== '') fd.append(k, v);
    });
    if (file) fd.append('file', file);
    return request('POST', '/api/support/inquiries', fd);
  },
  myInquiries: () => request('GET', '/api/support/inquiries'),
  attachmentUrl: (id) => `/api/support/inquiries/${id}/attachment`,
  // history: [{ role: 'user' | 'assistant', text }] 최근 6개
  // page: 지금 화면, lastErrorCode: 최근 오류 코드 (도우미가 상황에 맞게 안내)
  ask: (message, history, page, lastErrorCode) =>
    request('POST', '/api/support/assistant', { message, history, page, lastErrorCode }),
};

export const admin = {
  inquiries: ({ status, type } = {}) => {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (type) q.set('type', type);
    const qs = q.toString();
    return request('GET', `/api/admin/inquiries${qs ? `?${qs}` : ''}`);
  },
  handle: (id, status, answer) => request('PATCH', `/api/admin/inquiries/${id}`, { status, answer }),
  attachmentUrl: (id) => `/api/admin/inquiries/${id}/attachment`,
  stats: () => request('GET', '/api/admin/stats'),
};
