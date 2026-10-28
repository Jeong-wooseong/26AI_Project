// 백엔드 API 호출. 오류는 { code, message } 를 담은 ApiError 로 던진다.

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('NETWORK', '서버에 연결할 수 없습니다. 백엔드 실행 상태를 확인하십시오.', 0);
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // 백엔드가 꺼져 있으면 개발 서버 프록시가 JSON 이 아닌 오류를 돌려준다
    throw new ApiError('NETWORK', '서버에 연결할 수 없습니다. 백엔드 실행 상태를 확인하십시오.', res.status);
  }
  if (!res.ok) {
    throw new ApiError(data?.code ?? 'UNKNOWN', data?.message ?? `요청 실패 (${res.status})`, res.status);
  }
  return data;
}

export const api = {
  listStores: () => request('GET', '/api/stores'),
  createStore: (body) => request('POST', '/api/stores', body),
  updateStore: (id, body) => request('PUT', `/api/stores/${id}`, body),
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
  // 답글 초안 3종 생성 (다시 부르면 복사하지 않은 초안을 새로 바꿈)
  generateReplies: (reviewId) => request('POST', `/api/reviews/${reviewId}/replies`),
  reclassify: (reviewId) => request('POST', `/api/reviews/${reviewId}/classify`),
  selectReply: (replyId, editedContent) => request('PATCH', `/api/replies/${replyId}/select`, { editedContent }),
};
