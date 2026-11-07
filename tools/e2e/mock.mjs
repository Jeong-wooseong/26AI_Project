// 프런트 화면 확인용 가짜 백엔드 (포트 8080). 실제 DB·OpenAI·메일 없이 API 응답만 흉내 낸다. 테스트 전용 훅: /__reset, /__reset_auth, /__admin_seed
import http from 'node:http';
let stores = [], reviews = [], replies = [], sid = 1, rid = 1, pid = 1;
const json = (res, code, body) => { res.writeHead(code, {'Content-Type':'application/json'}); res.end(JSON.stringify(body)); };
const resp = (r) => { const rs = replies.filter(p => p.reviewId === r.id); return { ...r, finalReplyId: r.finalReplyId ?? null, completedAt: r.completedAt ?? null, finalUpdatedAt: r.finalUpdatedAt ?? null, replyStatus: r.finalReplyId ? 'COMPLETED' : rs.length ? 'DRAFT' : 'NONE', groupId: r.groupId ?? null, similarCount: r.groupId ? reviews.filter(x => x.groupId === r.groupId && x.id !== r.id).length : 0, replies: rs.map(p => ({ maxSimilarity: null, regenCount: 0, strategy: null, strategyReason: null, checklist: [], ...p })) }; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); let genFailOnce = true; const GEN_DELAY = Number(process.env.GEN_DELAY ?? 3500);
let failNext = true; let chunkFailOnce = true; let lostOnce = true;
const maskIt = (c) => (c || '').replace(/01\d-?\d{3,4}-?\d{4}/g, '[전화번호]').trim();
const log = []; globalThis.__log = log;
// 매장 메뉴·이용 방법·영업시간·연결한 장소 (백엔드 StoreProfile.normalized 와 같은 정리)
const EMPTY_PROFILE = { menus: [], delivery: false, takeout: false, dineIn: false, hours: null, place: null };
const cleanProfile = (pr) => ({ menus: (pr.menus || []).filter(x => x?.name?.trim()).map(x => ({ name: x.name.trim(), description: x.description?.trim() || null })), delivery: !!pr.delivery, takeout: !!pr.takeout, dineIn: !!pr.dineIn, hours: pr.hours?.trim() || null, place: pr.place?.url ? { id: pr.place.id ?? null, address: pr.place.address ?? null, url: pr.place.url } : null });
// 카카오 로컬 검색 흉내: '끔'이 들어가면 키 없음(503), '없음'이면 결과 없음
const PLACES = [
  { id: '101', name: '달빛카페 합정점', category: '카페', categoryPath: '음식점 > 카페 > 커피전문점', address: '서울 마포구 양화로 45', url: 'http://place.map.kakao.com/101' },
  { id: '102', name: '달빛카페 연남점', category: '디저트', categoryPath: '음식점 > 카페 > 디저트카페', address: '서울 마포구 동교로 210', url: 'http://place.map.kakao.com/102' },
  { id: '103', name: '달빛분식', category: '분식', categoryPath: '음식점 > 분식', address: '서울 마포구 월드컵로 12', url: 'http://place.map.kakao.com/103' },
];
http.createServer(async (req, res) => {
  let raw = ''; req.setEncoding('latin1'); for await (const c of req) raw += c;
  const ctype = req.headers['content-type'] || '';
  let body = null;
  if (ctype.startsWith('multipart/')) { body = {}; for (const part of raw.split(/--[-\w]+/)) { const nm = part.match(/name="([^"]+)"(?:; filename="([^"]*)")?/); if (!nm) continue; const val = part.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, ''); body[nm[1]] = nm[2] != null ? { filename: Buffer.from(nm[2], 'latin1').toString('utf8'), size: val.length } : Buffer.from(val, 'latin1').toString('utf8'); } }
  else if (raw) body = JSON.parse(Buffer.from(raw, 'latin1').toString('utf8'));
  const u = new URL(req.url, 'http://x'); const p = u.pathname; let m;
  if (p === '/__log') return json(res, 200, log);
  if (p === '/__reset') { stores = []; reviews = []; replies = []; globalThis.__insights = {}; genFailOnce = true; failNext = true; return json(res, 200, {}); }
  if (req.method === 'POST') log.push({ p, n: body?.reviews?.length ?? body?.items?.length ?? 0, platform: body?.platform });

  // ── 계정 (세션 1개만 흉내) ──
  const A = globalThis.__auth ??= { users: {}, session: null, inquiries: [], qid: 1 };
  if (p === '/__admin_seed') { const t = Date.now(); const mk = (i, kind, ok, code, msg) => ({ id: i, kind, model: 'gpt-4o-mini', success: ok, errorCode: code, errorMessage: msg, durationMs: 800 + i * 137, createdAt: new Date(t - (20 - i) * 36e5).toISOString() }); (globalThis.__auth.logs = [mk(1,'review_classification',true),mk(2,'reply_drafts',true),mk(3,'reply_drafts',false,'LLM_TIMEOUT','OpenAI 응답이 30초 안에 오지 않았습니다.'),mk(4,'tone_profile',true),mk(5,'weekly_insight',false,'LLM_BAD_JSON','응답 JSON 형식이 스키마와 맞지 않습니다: suggestions 누락'),mk(6,'reply_drafts',true),mk(7,'support_answer',true)]); for (const [i, [e, n, v, d, sn, rc]] of [['kim@test.com','김민지',true,false,'민지네 분식',12],['lee@test.com','이준호',true,true,'준호 치킨',4],['park@test.com','박서연',false,false,null,0]].entries()) globalThis.__auth.users[e] = { id: 10 + i, name: n, email: e, password: 'pass1234', verified: v, disabled: d, disabledAt: d ? new Date(t - 2 * 864e5).toISOString() : null, role: 'USER', joinedAt: new Date(t - (i + 3) * 864e5).toISOString(), lastLoginAt: v ? new Date(t - (i + 1) * 36e5).toISOString() : null, storeName: sn, reviewCount: rc }; return json(res, 200, {}); }
  if (p === '/__reset_auth') { globalThis.__auth = { users: {}, session: null, inquiries: [], qid: 1 }; return json(res, 200, {}); }
  if (p.startsWith('/api/') && req.method !== 'GET' && req.headers['x-xsrf-token'] !== 'xsrf-ok') return json(res, 403, { code: 'CSRF', message: '보안 토큰이 없거나 만료되었습니다.' });
  if (p === '/api/auth/me') { res.setHeader('Set-Cookie', 'XSRF-TOKEN=xsrf-ok; Path=/'); return A.session ? json(res, 200, A.session) : json(res, 401, { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }); }
  if (p === '/api/auth/signup') { const e = body.email.toLowerCase(); if (A.users[e]) return json(res, 409, { code: 'EMAIL_TAKEN', message: '이미 가입된 이메일입니다.' }); if (!body.name?.trim()) return json(res, 400, { code: 'VALIDATION', message: '이름을 입력하십시오.' }); A.users[e] = { id: Object.keys(A.users).length + 1, name: body.name.trim(), joinedAt: new Date().toISOString(), lastLoginAt: null, disabled: false, email: e, password: body.password, verified: false, role: Object.keys(A.users).length ? 'USER' : 'ADMIN' }; return json(res, 201, { message: 'sent' }); }
  if (p === '/api/auth/verify') { const u = A.users[body.token.replace(/^tok-/, '')]; if (!u) return json(res, 400, { code: 'INVALID_TOKEN', message: '인증 링크가 올바르지 않거나 만료되었습니다.' }); u.verified = true; return json(res, 200, { message: '이메일 인증이 끝났습니다. 로그인하십시오.' }); }
  if (p === '/api/auth/resend-verification') return json(res, 200, { message: '인증이 필요한 계정이면 인증 메일을 다시 보냈습니다.' });
  if (p === '/api/auth/login') { const u = A.users[body.email.toLowerCase()]; if (!u || u.password !== body.password) return json(res, 401, { code: 'BAD_CREDENTIALS', message: '이메일 또는 비밀번호가 올바르지 않습니다.' }); if (!u.verified) return json(res, 403, { code: 'EMAIL_NOT_VERIFIED', message: '이메일 인증을 마쳐야 로그인할 수 있습니다.' }); if (u.disabled) return json(res, 403, { code: 'ACCOUNT_DISABLED', message: '이용이 중지된 계정입니다. 고객 지원으로 문의하십시오.' }); u.lastLoginAt = new Date().toISOString(); A.session = { id: u.id, email: u.email, name: u.name, role: u.role }; return json(res, 200, A.session); }
  if (p === '/api/auth/logout') { A.session = null; res.writeHead(204); return res.end(); }
  if (p === '/api/auth/password-reset/request') return json(res, 200, { message: '가입된 이메일이면 비밀번호 재설정 링크를 보냈습니다.' });
  if (p === '/api/auth/password-reset/confirm') { const u = A.users[body.token.replace(/^tok-/, '')]; if (!u) return json(res, 400, { code: 'INVALID_TOKEN', message: '재설정 링크가 올바르지 않거나 만료되었습니다.' }); u.password = body.password; return json(res, 200, { message: 'ok' }); }
  if (p.startsWith('/api/') && !A.session) return json(res, 401, { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' });
  if (p === '/api/auth/account' && req.method === 'DELETE') { const u = A.users[A.session.email]; if (u.password !== body.password) return json(res, 400, { code: 'BAD_CREDENTIALS', message: '비밀번호가 올바르지 않습니다.' }); delete A.users[u.email]; A.session = null; stores = []; reviews = []; replies = []; return json(res, 200, { message: '계정과 모든 데이터를 삭제했습니다.' }); }
  // ── 고객 지원 ──
  if (p === '/api/support/faq') { const fs = await import('node:fs'); return json(res, 200, JSON.parse(fs.readFileSync(new URL('../../backend/src/main/resources/support/faq.json', import.meta.url), 'utf8'))); }
  const iq = (q, admin) => ({ ...q, userEmail: admin ? q.userEmail : null });
  if (p === '/api/support/inquiries' && req.method === 'POST') { if (!body.title?.trim()) return json(res, 400, { code: 'INVALID_INPUT', message: '제목을 입력하십시오.' }); const q = { id: A.qid++, type: body.type, title: body.title, content: body.content, location: body.location ?? null, pagePath: body.pagePath ?? null, errorCode: body.errorCode ?? null, status: 'RECEIVED', answer: null, answeredAt: null, attachmentName: body.file?.filename ?? null, attachmentSize: body.file?.size ?? null, createdAt: new Date().toISOString(), userEmail: A.session.email }; A.inquiries.unshift(q); return json(res, 201, iq(q)); }
  if (p === '/api/support/inquiries') return json(res, 200, A.inquiries.filter(q => q.userEmail === A.session.email).map(q => iq(q)));
  if (/^\/api\/(support|admin)\/inquiries\/\d+\/attachment$/.test(p)) { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#eef2fc"/><text x="20" y="96" font-size="18" fill="#2449c8">오류 화면 캡처 (예시)</text></svg>'); }
  if (p === '/api/support/assistant') { const t = body.message; await sleep(600); globalThis.__lastAsk = body;
    if (/메일/.test(t)) return json(res, 200, { answer: '인증 메일은 몇 분 안에 도착해요. 스팸함도 확인해 보시고, 로그인 화면에서 인증 메일을 다시 받을 수 있어요.', faqIds: ['mail'], suggestInquiry: false, inquiryType: null, source: 'AI' });
    if (/생성/.test(t)) return json(res, 200, { answer: '답글 생성에 문제가 있으시군요. 리뷰가 칭찬·불만·문의로 분류되었는지 확인하고, 잠시 뒤 다시 생성해 보세요. 같은 문제가 계속되면 오류 제보를 남겨 주세요.', faqIds: ['draft-failed'], suggestInquiry: true, inquiryType: 'BUG', source: 'AI' });
    return json(res, 200, { answer: '자주 묻는 질문에서 맞는 답을 찾지 못했어요. 고객 지원에서 문의를 남겨 주시면 확인해 드릴게요.', faqIds: [], suggestInquiry: true, inquiryType: 'GENERAL', source: 'FAQ' }); }
  // ── 관리자 ──
  if (p.startsWith('/api/admin/') && A.session.role !== 'ADMIN') return json(res, 403, { code: 'FORBIDDEN', message: '이 기능을 사용할 권한이 없습니다.' });
  if (p === '/api/admin/inquiries') { const st = u.searchParams.get('status'), ty = u.searchParams.get('type'); return json(res, 200, A.inquiries.filter(q => (!st || q.status === st) && (!ty || q.type === ty)).map(q => iq(q, true))); }
  if ((m = p.match(/^\/api\/admin\/inquiries\/(\d+)$/)) && req.method === 'PATCH') { const q = A.inquiries.find(x => x.id == m[1]); if (body.answer) { q.answer = body.answer; q.answeredAt = new Date().toISOString(); q.status = 'ANSWERED'; } else if (body.status) q.status = body.status; return json(res, 200, iq(q, true)); }

  const userRow = (x) => ({ id: x.id, email: x.email, name: x.name, role: x.role, status: x.disabled ? 'DISABLED' : x.verified ? 'ACTIVE' : 'UNVERIFIED', storeName: x.id === A.session.id ? (stores[0]?.name ?? null) : (x.storeName ?? null), joinedAt: x.joinedAt, lastLoginAt: x.lastLoginAt, reviewCount: x.id === A.session.id ? reviews.length : (x.reviewCount ?? 0) });
  A.logs ??= [];
  if (p === '/api/admin/overview') {
    const us = Object.values(A.users), now = Date.now(), day = 864e5;
    const daily = Array.from({ length: 14 }, (_, i) => { const d = new Date(now - (13 - i) * day); const k = d.toISOString().slice(0, 10); const lg = A.logs.filter(l => l.createdAt.startsWith(k)); return { date: k, reviews: reviews.filter(r => (r.createdAt ?? '').startsWith(k)).length + (i === 13 ? 0 : (i * 3) % 5), activeUsers: i % 3, signups: us.filter(x => x.joinedAt.startsWith(k)).length, aiCalls: lg.length + (i * 2) % 7, aiFailures: lg.filter(l => !l.success).length + (i === 10 ? 2 : 0) }; });
    const kinds = {}; A.logs.forEach(l => { kinds[l.kind] ??= { kind: l.kind, success: 0, failure: 0 }; kinds[l.kind][l.success ? 'success' : 'failure']++; });
    const f7 = A.logs.filter(l => !l.success).length;
    return json(res, 200, { users: us.length, activeUsers7d: us.filter(x => x.lastLoginAt).length, newUsers7d: us.length, disabledUsers: us.filter(x => x.disabled).length, reviews: reviews.length, reviews7d: reviews.length, completed7d: reviews.filter(r => r.status === 'DONE' || r.finalReply).length, aiCalls7d: A.logs.length, aiFailures7d: f7, aiLogSince: A.logs[0]?.createdAt ?? null, inquiries: A.inquiries.length, openInquiries: A.inquiries.filter(q => q.status !== 'ANSWERED').length, daily, aiByKind: Object.values(kinds), system: { database: true, openAiConfigured: true, mailConfigured: false, lastAiSuccessAt: A.logs.filter(l => l.success).at(-1)?.createdAt ?? null, lastAiFailureAt: A.logs.filter(l => !l.success).at(-1)?.createdAt ?? null, aiCalls24h: A.logs.length, aiFailures24h: f7 } });
  }
  if (p === '/api/admin/users') { const st = u.searchParams.get('status'); return json(res, 200, Object.values(A.users).map(userRow).filter(r => !st || r.status === st)); }
  if ((m = p.match(/^\/api\/admin\/users\/(\d+)$/))) { const x = Object.values(A.users).find(y => y.id == m[1]); if (!x) return json(res, 404, { code: 'NOT_FOUND', message: '회원을 찾을 수 없습니다.' }); const mine = x.id === A.session.id;
    return json(res, 200, { user: userRow(x), stores: mine ? stores.map(s => ({ id: s.id, name: s.name, category: s.category, reviews: reviews.filter(r => r.storeId === s.id || true).length, completed: 1, styleReady: !!s.toneProfile })) : [], inquiries: A.inquiries.filter(q => q.userEmail === x.email).map(q => ({ id: q.id, title: q.title, status: q.status, createdAt: q.createdAt })), disabledAt: x.disabledAt ?? null }); }
  if ((m = p.match(/^\/api\/admin\/users\/(\d+)\/status$/)) && req.method === 'PATCH') { const x = Object.values(A.users).find(y => y.id == m[1]); if (x.id === A.session.id) return json(res, 400, { code: 'SELF', message: '지금 로그인한 계정은 이용 중지할 수 없습니다.' }); x.disabled = !body.active; x.disabledAt = body.active ? null : new Date().toISOString(); return json(res, 200, userRow(x)); }
  if (p === '/api/admin/ai-logs') { const fo = u.searchParams.get('failedOnly') === 'true'; return json(res, 200, A.logs.filter(l => !fo || !l.success).slice().reverse()); }
  if (p === '/api/admin/feedback') { const v = u.searchParams.get('value'), rs = u.searchParams.get('reason');
    return json(res, 200, replies.filter(r => r.feedback && (!v || r.feedback === v) && (!rs || (r.feedbackReasons || []).includes(rs))).sort((a, b) => (b.feedbackAt || '').localeCompare(a.feedbackAt || '')).map(r => { const rv = reviews.find(x => x.id === r.reviewId) || {}; return { replyId: r.id, value: r.feedback, reasons: r.feedbackReasons || [], comment: r.feedbackComment || null, tone: r.tone, replyText: r.editedContent || r.content, isFinal: rv.finalReplyId === r.id, edited: !!r.editedContent, reviewId: rv.id, rating: rv.rating, reviewType: rv.type, reviewText: rv.maskedContent, storeName: stores[0]?.name, ownerEmail: A.session.email, feedbackAt: r.feedbackAt }; })); }
  if (p === '/api/admin/stats') { const cnt = (f) => A.inquiries.reduce((a, q) => { const k = f(q); a[k] = (a[k] || 0) + 1; return a; }, {}); const fb = replies.filter(r => r.feedback); const down = fb.filter(r => r.feedback === 'DOWN');
    return json(res, 200, { inquiries: A.inquiries.length, lastSevenDays: A.inquiries.length, byStatus: cnt(q => q.status), byType: cnt(q => q.type), byLocation: cnt(q => q.location || '미지정'), feedbackUp: fb.length - down.length, feedbackDown: down.length, downReasons: down.flatMap(r => r.feedbackReasons).reduce((a, k) => { a[k] = (a[k] || 0) + 1; return a; }, {}), downByTone: down.reduce((a, r) => { a[r.tone] = (a[r.tone] || 0) + 1; return a; }, {}) }); }
  if ((m = p.match(/^\/api\/replies\/(\d+)\/feedback$/))) { const rp = replies.find(x => x.id == m[1]); rp.feedback = body.value; rp.feedbackReasons = body.value === 'DOWN' ? body.reasons : []; rp.feedbackComment = body.comment ?? null; rp.feedbackAt = new Date().toISOString(); return json(res, 200, { maxSimilarity: null, regenCount: 0, strategy: null, strategyReason: null, checklist: [], ...rp }); }
  if (p === '/api/stores' && req.method === 'GET') return json(res, 200, stores);
  if (p === '/api/places/search') { const q = (u.searchParams.get('query') || '').trim(); if (q.includes('끔')) return json(res, 503, { code: 'PLACE_SEARCH_OFF', message: '지도 검색이 아직 설정되지 않았습니다. 매장명과 업종을 직접 입력하십시오.' }); if (q.length < 2) return json(res, 400, { code: 'QUERY_TOO_SHORT', message: '매장 이름을 두 글자 이상 입력하십시오.' }); return json(res, 200, q.includes('없음') ? [] : PLACES.filter(x => q.split(/\s+/).some(w => x.name.includes(w)))); }
  if (p === '/api/stores' && req.method === 'POST') { const s = { id: sid++, name: body.name, category: body.category, info: body.info || null, profile: body.profile ? cleanProfile(body.profile) : EMPTY_PROFILE, toneProfile: null, sampleReplies: [], replySettings: { defaultTone: 'POLITE', avoidDuplicates: true } }; stores.push(s); return json(res, 201, s); }
  if ((m = p.match(/^\/api\/stores\/(\d+)$/)) && req.method === 'PUT') { const s = stores.find(x => x.id == m[1]); s.name = body.name; s.category = body.category; if (body.info != null) s.info = body.info || null; if (body.profile) s.profile = cleanProfile(body.profile); s.updatedAt = new Date().toISOString(); return json(res, 200, s); }
  if ((m = p.match(/^\/api\/stores\/(\d+)\/tone-profile\/extract$/))) return json(res, 200, { formality: '해요체', emojiLevel: '가끔', emojiExamples: ['😊'], length: '2~3문장', phrases: ['감사드려요', '보답할게요'], closing: '오늘도 좋은 하루 되세요!' });
  if ((m = p.match(/^\/api\/stores\/(\d+)\/reply-settings$/))) { const s = stores.find(x => x.id == m[1]); s.replySettings = { defaultTone: body.defaultTone, avoidDuplicates: !!body.avoidDuplicates }; return json(res, 200, s); }
  if ((m = p.match(/^\/api\/stores\/(\d+)\/tone-profile$/))) { const s = stores.find(x => x.id == m[1]); s.toneProfile = body.toneProfile; s.sampleReplies = body.sampleReplies; return json(res, 200, s); }
  if ((m = p.match(/^\/api\/stores\/(\d+)\/reviews\/duplicate-check$/))) {
    const idx = []; body.items.forEach((it, i) => { const mk = maskIt(it.content); if (mk && reviews.some(r => r.platform === it.platform && r.maskedContent === mk)) idx.push(i); });
    return json(res, 200, { duplicateIndexes: idx });
  }
  if ((m = p.match(/^\/api\/stores\/(\d+)\/reviews$/)) && req.method === 'POST') {
    if (body.reviews.length > 30) return json(res, 400, { code: 'INVALID_INPUT', message: '한 번에 최대 30건까지 등록할 수 있습니다.' });
    if (chunkFailOnce && body.reviews.some(it => /실패테스트/.test(it.content || ''))) { chunkFailOnce = false; return json(res, 502, { code: 'LLM_FAILED', message: '일시 오류(테스트).' }); }
    const lost = lostOnce && body.reviews.some(it => /응답유실/.test(it.content || '')); if (lost) lostOnce = false;
    const out = body.reviews.map(it => {
      const masked = maskIt(it.content);
      const r = { id: rid++, platform: body.platform, rating: it.rating, maskedContent: masked || null, writtenAt: it.writtenAt ?? null, keywords: [], confidence: null, status: 'CLASSIFIED', failureCode: null, createdAt: new Date().toISOString() };
      if (!masked) { Object.assign(r, { type: 'RATING_ONLY', sentiment: it.rating >= 4 ? 'POSITIVE' : 'NEGATIVE', confidence: 1 }); replies.push({ id: pid++, reviewId: r.id, tone: 'TEMPLATE', content: '좋은 별점 남겨주셔서 감사드려요. 😊 오늘도 좋은 하루 되세요!', editedContent: null, selected: false }); }
      else if (/망해/.test(masked)) Object.assign(r, { type: 'MALICIOUS', sentiment: 'NEGATIVE', keywords: ['응대 태도'], confidence: 0.88 });
      else if (/\?/.test(masked) && failNext) { failNext = false; Object.assign(r, { type: null, sentiment: null, status: 'FAILED', failureCode: 'LLM_FAILED' }); }
      else if (it.rating <= 2) Object.assign(r, { type: 'COMPLAINT', sentiment: 'NEGATIVE', keywords: /양이/.test(masked) ? ['양 부족'] : /식었/.test(masked) ? ['배달 지연', '식은 음식'] : ['배달 지연'], confidence: 0.93 });
      else Object.assign(r, { type: 'PRAISE', sentiment: 'POSITIVE', keywords: ['라떼'], confidence: 0.97 });
      if (masked) { const sim = reviews.find(x => x.maskedContent && x.maskedContent.slice(0, 4) === masked.slice(0, 4)); if (sim) { sim.groupId = sim.groupId ?? ('g' + sim.id); r.groupId = sim.groupId; } }
      reviews.unshift(r); return resp(r);
    });
    if (lost) { res.destroy(); return; }
    return json(res, 201, out);
  }
  if ((m = p.match(/^\/api\/stores\/(\d+)\/reviews$/))) return json(res, 200, reviews.map(resp));
  if ((m = p.match(/^\/api\/stores\/(\d+)\/reports(\/insight)?$/))) {
    const pad = (n) => String(n).padStart(2, '0'); const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const w = new Date((u.searchParams.get('week') || iso(new Date())) + 'T00:00:00'); w.setDate(w.getDate() - ((w.getDay() + 6) % 7));
    const ws = iso(w); const we = new Date(w); we.setDate(we.getDate() + 6); const pw = new Date(w); pw.setDate(pw.getDate() - 7);
    const dateOf = (r) => r.writtenAt ?? iso(new Date(r.createdAt));
    const inWeek = (start) => { const e = new Date(start); e.setDate(e.getDate() + 7); return reviews.filter(r => dateOf(r) >= iso(start) && dateOf(r) < iso(e)); };
    const cur = inWeek(w), prev = inWeek(pw);
    const comp = (l) => l.filter(r => r.type === 'COMPLAINT');
    const topicsOf = (l) => { const c = {}; comp(l).forEach(r => new Set(r.keywords).forEach(k => c[k] = (c[k] || 0) + 1)); return c; };
    const tn = topicsOf(cur), tp = topicsOf(prev);
    const topics = Object.entries(tn).map(([topic, count]) => ({ topic, count, previousCount: tp[topic] || 0, change: count - (tp[topic] || 0) })).sort((a, b) => b.count - a.count || b.change - a.change).slice(0, 5);
    const avg = (l) => l.length ? Math.round(l.reduce((a, r) => a + r.rating, 0) / l.length * 10) / 10 : null;
    const tc = {}; cur.forEach(r => { const k = r.status === 'FAILED' ? 'FAILED' : r.type; tc[k] = (tc[k] || 0) + 1; });
    const target = cur.filter(r => r.status === 'CLASSIFIED'); const finals = target.filter(r => r.finalReplyId).map(r => replies.find(p => p.id === r.finalReplyId)).filter(Boolean);
    const edited = finals.filter(p => p.editedContent).length;
    const reps = comp(cur).sort((a, b) => a.rating - b.rating).slice(0, 3).map(r => ({ reviewId: r.id, platform: r.platform, rating: r.rating, maskedContent: r.maskedContent, topic: r.keywords[0] ?? null, date: dateOf(r) }));
    const repl = (l) => { const t = l.filter(r => r.status === 'CLASSIFIED'); const f = t.filter(r => r.finalReplyId).length; return { target: t.length, completed: f, edited: 0, regenerated: 0, completionRate: t.length ? Math.round(f * 100 / t.length) : null, editRate: null }; };
    const resolvedTopics = Object.entries(tp).filter(([k]) => !tn[k]).map(([topic, c]) => ({ topic, count: 0, previousCount: c, change: -c }));
    const rc = (l) => [1, 2, 3, 4, 5].map(n => l.filter(r => r.rating === n).length);
    const stats = { ratingCounts: rc(cur), previousRatingCounts: rc(prev), previousComplaintRate: prev.length ? Math.round(comp(prev).length * 100 / prev.length) : null, resolvedTopics, previousReplies: repl(prev), weekStart: ws, weekEnd: iso(we), total: cur.length, previousTotal: prev.length, avgRating: avg(cur), previousAvgRating: avg(prev), typeCounts: tc,
      complaints: comp(cur).length, previousComplaints: comp(prev).length, complaintRate: cur.length ? Math.round(comp(cur).length * 100 / cur.length) : null,
      topics, representatives: reps, replies: { target: target.length, completed: finals.length, edited, regenerated: finals.filter(p => p.regenCount > 0).length,
        completionRate: target.length ? Math.round(finals.length * 100 / target.length) : null, editRate: finals.length ? Math.round(edited * 100 / finals.length) : null } };
    const pos = (l) => l.filter(r => r.sentiment === 'POSITIVE').length;
    const daily = (l, start) => [0,1,2,3,4,5,6].map(i => { const d = new Date(start); d.setDate(d.getDate() + i); const day = iso(d); const of = l.filter(r => dateOf(r) === day); return { date: day, total: of.length, avgRating: avg(of), positive: pos(of), complaints: comp(of).length }; });
    Object.assign(stats, { positiveRate: cur.length ? Math.round(pos(cur) * 100 / cur.length) : null, previousPositiveRate: prev.length ? Math.round(pos(prev) * 100 / prev.length) : null, daily: daily(cur, w), previousDaily: daily(prev, pw) });
    globalThis.__insights = globalThis.__insights || {};
    const key = JSON.stringify([stats.total, stats.complaints, topics]);
    if (m[2]) {
      if (!cur.length) return json(res, 400, { code: 'NO_REVIEWS', message: '이 주에 등록된 리뷰가 없어 요약을 만들 수 없습니다.' });
      await sleep(GEN_DELAY);
      const top = topics[0];
      globalThis.__insights[m[1] + ws] = { key, summary: `이번 주 리뷰 ${stats.total}건 중 불만이 ${stats.complaints}건(${stats.complaintRate}%)이며, ${top ? top.topic + '이 ' + top.count + '건으로 가장 많았습니다.' : '뚜렷한 불만 주제는 없었습니다.'}`,
        positives: stats.previousTotal && stats.avgRating > stats.previousAvgRating ? [`평균 별점이 지난주 ${stats.previousAvgRating}점에서 ${stats.avgRating}점으로 올랐습니다.`] : ['칭찬 리뷰에서 음료 맛에 대한 언급이 이어졌습니다.'],
        improvements: top ? [`${top.topic} 불만이 ${top.count}건으로 가장 많았습니다.`] : [],
        suggestions: top ? [`${top.topic} 의견이 나온 주문의 시간대와 메뉴를 확인해 볼 만합니다.`, '불만 리뷰에는 지적한 내용을 구체적으로 인정하는 답글을 먼저 달아 보십시오.'] : [], generatedAt: new Date().toISOString().slice(0, 19) };
    }
    const ins = globalThis.__insights[m[1] + ws];
    return json(res, 200, { stats, insight: ins ? { summary: ins.summary, positives: ins.positives ?? [], improvements: ins.improvements ?? [], suggestions: ins.suggestions, generatedAt: ins.generatedAt, stale: ins.key !== key } : null });
  }
  if ((m = p.match(/^\/api\/reviews\/(\d+)$/)) && req.method === 'DELETE') { reviews = reviews.filter(x => x.id != m[1]); replies = replies.filter(x => x.reviewId != m[1]); res.writeHead(204); return res.end(); }
  if ((m = p.match(/^\/api\/reviews\/(\d+)\/replies$/))) {
    const r = reviews.find(x => x.id == m[1]);
    if (!r) return json(res, 404, { code: 'NOT_FOUND', message: '리뷰를 찾을 수 없습니다.' });
    if (!['PRAISE','COMPLAINT','INQUIRY'].includes(r.type)) return json(res, 400, { code: 'NOT_DRAFT_TARGET', message: '칭찬·불만·문의로 분류된 리뷰만 답글 초안을 생성합니다.' });
    await sleep(GEN_DELAY);
    if (genFailOnce && /생성실패/.test(r.maskedContent || '')) { genFailOnce = false; return json(res, 502, { code: 'LLM_RATE_LIMIT', message: 'OpenAI 요청 속도 제한에 걸렸습니다. 1분 정도 뒤에 다시 시도하십시오.' }); }
    replies = replies.filter(p => !(p.reviewId === r.id && p.tone !== 'TEMPLATE' && p.id !== r.finalReplyId));
    const kw = r.keywords[0] || '방문';
    const fill = r.type === 'INQUIRY' ? ' [주차 안내 입력]' : '';
    for (const [tone, text] of [['POLITE', `${kw}을 맛있게 즐겨주셨다니 정말 기쁩니다. 우유 거품의 부드러움까지 알아봐 주셔서 더욱 힘이 납니다.${fill} 다음 방문에도 같은 맛으로 준비하겠습니다.`], ['FRIENDLY', `${kw} 한 잔이 하루에 작은 쉼이 되었다니 저희도 뿌듯해요.${fill} 다음에도 따뜻하게 준비해 둘게요 😊`], ['CONCISE', `${kw} 좋게 봐주셔서 고마워요.${fill}`]])
      replies.push({ id: pid++, reviewId: r.id, tone, content: text, editedContent: null, selected: false, regenCount: r.groupId ? 1 : 0, maxSimilarity: r.groupId ? (tone === 'CONCISE' ? 0.92 : 0.71) : 0.4 });
    return json(res, 200, resp(r));
  }
  if ((m = p.match(/^\/api\/reviews\/(\d+)\/malicious-guide$/))) {
    const r = reviews.find(x => x.id == m[1]);
    if (!r || r.type !== 'MALICIOUS') return json(res, 400, { code: 'NOT_MALICIOUS', message: '악성으로 분류된 리뷰만 대응 가이드를 만듭니다.' });
    await sleep(GEN_DELAY);
    const strategy = body?.strategy ?? 'HOLD';
    const G = {
      HOLD: ['리뷰에 영업 방해성 표현과 근거 없는 비방이 있어, 답글로 맞대응하기보다 플랫폼 신고 기준을 먼저 검토하는 편이 안전합니다.', ['해당 주문 내역이 있는지 확인', '플랫폼의 리뷰 신고 기준 확인'], '이용에 불편을 드렸다면 죄송합니다. 말씀하신 내용은 매장에서 다시 확인해 보겠습니다.'],
      APOLOGY: ['고객이 불쾌함을 느낀 상황이므로 짧게 사과하고 논쟁 없이 마무리하는 방법입니다. 사실과 다른 부분을 인정하는 표현은 피했습니다.', ['응대한 직원에게 당시 상황 확인'], '방문하신 날 불편한 기분으로 돌아가시게 해 죄송합니다. 더 세심하게 응대하겠습니다.'],
      FACT: ['고객 주장과 실제 운영이 다르다면 감정 없이 사실만 설명합니다. 확인되지 않은 사실은 채울 자리로 남겼습니다.', ['당일 운영 기록 확인', '설명할 사실이 정확한지 확인'], '말씀하신 부분은 [확인한 사실 입력]입니다. 오해가 없도록 앞으로 더 분명하게 안내하겠습니다.'],
    }[strategy];
    replies = replies.filter(p => !(p.reviewId === r.id && p.tone === 'GUIDE' && p.id !== r.finalReplyId));
    replies.push({ id: pid++, reviewId: r.id, tone: 'GUIDE', content: G[2], editedContent: null, selected: false, strategy, strategyReason: G[0], checklist: G[1] });
    return json(res, 200, resp(r));
  }
  if ((m = p.match(/^\/api\/reviews\/(\d+)\/classify$/))) { const r = reviews.find(x => x.id == m[1]); Object.assign(r, { type: 'INQUIRY', sentiment: 'NEUTRAL', keywords: ['주차'], confidence: 0.95, status: 'CLASSIFIED', failureCode: null }); return json(res, 200, resp(r)); }
  if ((m = p.match(/^\/api\/reviews\/(\d+)\/final-reply$/)) && req.method === 'PUT') {
    const r = reviews.find(x => x.id == m[1]); const rp = replies.find(x => x.id == body.replyId);
    if (!rp || rp.reviewId !== r.id) return json(res, 400, { code: 'REPLY_MISMATCH', message: '이 리뷰의 답글이 아닙니다.' });
    if (!body.content?.trim()) return json(res, 400, { code: 'INVALID_INPUT', message: '답글 내용을 입력하십시오.' });
    if (r.finalReplyId && r.finalReplyId !== rp.id) { const old = replies.find(x => x.id === r.finalReplyId); if (old) old.selected = false; }
    if (rp.tone === 'GUIDE' && !body.confirmed) return json(res, 400, { code: 'CONFIRM_REQUIRED', message: '악성 리뷰 대응 답글은 사장님 확인 후에 작성 완료할 수 있습니다.' });
    rp.selected = true; const t = body.content.trim(); rp.editedContent = t === rp.content ? null : t;
    const now = new Date().toISOString().slice(0, 19); r.finalReplyId = rp.id; r.completedAt = r.completedAt ?? now; r.finalUpdatedAt = now;
    await sleep(400); return json(res, 200, resp(r));
  }
  if ((m = p.match(/^\/api\/replies\/(\d+)\/select$/))) { const rp = replies.find(x => x.id == m[1]); rp.selected = true; return json(res, 200, rp); }
  json(res, 404, { code: 'NOT_FOUND', message: 'nope' });
}).listen(8080, () => console.log('mock on 8080'));
