// 관리자 전용: 대시보드 · 회원 관리 · 문의 관리 · 서비스 모니터링 · 운영 통계
// 일반 사용자 화면보다 정보 밀도를 높이고, 위험한 작업(이용 중지)은 한 번 더 확인한다. 모든 수치는 DB 기록으로 계산한다.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { admin } from '../api.js';
import Icon from '../components/Icon.jsx';
import {
  Alert, EmptyState, FormInput, FormSelect, PageHeader, PrimaryButton, SecondaryButton,
} from '../components/ui.jsx';
import { TONE_LABEL, formatDateTime } from '../components/reply/replyModel.js';
import { TYPE_LABEL as REVIEW_TYPE_LABEL } from '../labels.js';
import { INQUIRY_TYPES, InquiryMeta, STATUS, TYPE_LABEL, inquiryNo } from './Support.jsx';

export const REASON_LABEL = {
  CONTENT_MISMATCH: '리뷰 내용과 맞지 않음',
  AWKWARD_TONE: '말투가 어색함',
  WRONG_FACT: '사실과 다른 내용',
  LENGTH: '너무 길거나 짧음',
  OTHER: '기타',
};
const KIND_LABEL = {
  review_classification: '리뷰 분류',
  reply_drafts: '답글 초안',
  malicious_guide: '악성 대응 가이드',
  tone_profile: '말투 학습',
  weekly_insight: '리포트 AI 분석',
  support_answer: '도우미 답변',
};
const USER_STATUS = {
  ACTIVE: ['이용 중', 'is-ok'],
  UNVERIFIED: ['인증 전', 'is-wait'],
  DISABLED: ['이용 중지', 'is-bad'],
};
const TABS = [
  ['', '대시보드', 'report'],
  ['users', '회원 관리', 'user'],
  ['inquiries', '문의 관리', 'support'],
  ['feedback', '답글 피드백', 'dislike'],
  ['monitoring', '서비스 모니터링', 'shield'],
  ['stats', '운영 통계', 'reviews'],
];
const kindLabel = (k) => KIND_LABEL[k] ?? k;
const dateOnly = (iso) => (iso ? formatDateTime(iso).split(' ')[0] : '-');
const pct = (part, total) => (total ? Math.round((part / total) * 100) : 0);

export default function Admin({ toast, me, sub }) {
  const tab = TABS.some(([k]) => k === (sub ?? '')) ? (sub ?? '') : '';
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(null);
  const [stamp, setStamp] = useState(0); // 새로고침하면 각 탭도 다시 불러온다

  const load = useCallback(async () => {
    setError(null);
    try {
      setOverview(await admin.overview());
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load, stamp]);

  return (
    <>
      <PageHeader
        title={<>관리자 <span className="admin-badge"><Icon name="shield" size={14} />관리자 전용</span></>}
        description="서비스 운영자만 볼 수 있는 화면입니다. 회원·문의·AI 호출 기록을 확인하고 관리합니다."
        actions={<SecondaryButton tone="neutral" icon="retry" onClick={() => setStamp((n) => n + 1)}>새로고침</SecondaryButton>}
      />
      <nav className="admin-tabs" aria-label="관리 메뉴">
        {TABS.map(([key, label, icon]) => (
          <a key={key} href={`#admin${key ? `/${key}` : ''}`} aria-current={tab === key ? 'page' : undefined}>
            <Icon name={icon} size={16} />{label}
            {key === 'inquiries' && overview?.openInquiries > 0 && <em>{overview.openInquiries}</em>}
          </a>
        ))}
      </nav>
      {error && <Alert>{error}</Alert>}
      {tab === '' && (overview ? <Dashboard o={overview} stamp={stamp} /> : !error && <EmptyState loading description="불러오는 중…" />)}
      {tab === 'users' && <Members me={me} toast={toast} stamp={stamp} onChanged={load} />}
      {tab === 'inquiries' && <Inquiries toast={toast} stamp={stamp} onChanged={load} />}
      {tab === 'feedback' && <Feedback stamp={stamp} />}
      {tab === 'monitoring' && (overview ? <Monitoring o={overview} stamp={stamp} /> : !error && <EmptyState loading description="불러오는 중…" />)}
      {tab === 'stats' && (overview ? <Stats o={overview} stamp={stamp} /> : !error && <EmptyState loading description="불러오는 중…" />)}
    </>
  );
}

/* ── 대시보드 ─────────────────────────────────────────── */

function Dashboard({ o, stamp }) {
  const [open, setOpen] = useState(null);
  const [fails, setFails] = useState(null);
  useEffect(() => {
    admin.inquiries({}).then((l) => setOpen(l.filter((q) => q.status !== 'ANSWERED').slice(0, 5))).catch(() => setOpen([]));
    admin.aiLogs({ failedOnly: true, limit: 5 }).then(setFails).catch(() => setFails([]));
  }, [stamp]);
  return (
    <>
      <section className="summary summary-admin" aria-label="운영 지표">
        <Kpi label="전체 가입 회원" value={o.users} unit="명" sub={`최근 7일 신규 ${o.newUsers7d}명${o.disabledUsers ? `, 이용 중지 ${o.disabledUsers}명` : ''}`} />
        <Kpi label="활성 사용자" value={o.activeUsers7d} unit="명" sub="최근 7일 안에 로그인한 회원" />
        <Kpi label="전체 등록 리뷰" value={o.reviews} unit="건" sub={`최근 7일 ${o.reviews7d}건 등록`} />
        <Kpi label="AI 호출 (7일)" value={o.aiCalls7d} unit="건"
             sub={o.aiLogSince ? `실패 ${o.aiFailures7d}건 (${pct(o.aiFailures7d, o.aiCalls7d)}%)` : '아직 기록 없음'}
             tone={o.aiFailures7d ? 'is-bad' : undefined} />
        <Kpi label="문의 접수" value={o.inquiries} unit="건" sub={`미처리 ${o.openInquiries}건`} tone={o.openInquiries ? 'is-warn' : undefined} />
      </section>

      <div className="admin-2col">
        <section className="ap-panel">
          <div className="ap-head">
            <h2>답변을 기다리는 문의</h2>
            <a className="text-link" href="#admin/inquiries">문의 관리<Icon name="next" size={14} /></a>
          </div>
          {!open ? <p className="hint">불러오는 중…</p> : open.length === 0 ? (
            <p className="ap-empty"><Icon name="confirm" size={16} />미처리 문의가 없습니다.</p>
          ) : (
            <ul className="ap-list">
              {open.map((q) => (
                <li key={q.id}>
                  <span className="mono-no">{inquiryNo(q.id)}</span>
                  <span className="ap-list-main"><strong>{q.title}</strong><small>{TYPE_LABEL[q.type] ?? q.type}, {q.userEmail}</small></span>
                  <span className="ap-list-end">{formatDateTime(q.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="ap-panel">
          <div className="ap-head">
            <h2>최근 AI 호출 실패</h2>
            <a className="text-link" href="#admin/monitoring">서비스 모니터링<Icon name="next" size={14} /></a>
          </div>
          {!fails ? <p className="hint">불러오는 중…</p> : fails.length === 0 ? (
            <p className="ap-empty"><Icon name="confirm" size={16} />{o.aiLogSince ? '기록된 실패가 없습니다.' : '아직 AI 호출 기록이 없습니다.'}</p>
          ) : (
            <ul className="ap-list">
              {fails.map((l) => (
                <li key={l.id}>
                  <span className="code-chip is-bad">{l.errorCode ?? 'ERROR'}</span>
                  <span className="ap-list-main"><strong>{kindLabel(l.kind)}</strong><small>{l.errorMessage}</small></span>
                  <span className="ap-list-end">{formatDateTime(l.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function Kpi({ label, value, unit, sub, tone }) {
  return (
    <div>
      <span className="summary-label">{label}</span>
      <p className="summary-value"><strong className={tone}>{value}</strong>{unit}</p>
      <p className="summary-sub">{sub}</p>
    </div>
  );
}

/* ── 회원 관리 ─────────────────────────────────────────── */

const SORTS = [
  ['joined', '가입일 최신순'],
  ['login', '최근 로그인순'],
  ['reviews', '리뷰 많은 순'],
];

function Members({ me, toast, stamp, onChanged }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('joined');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await admin.users({ status }));
    } catch (e) {
      setError(e.message);
    }
  }, [status]);
  useEffect(() => {
    load();
  }, [load, stamp]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (rows ?? []).filter((r) => !q || [r.email, r.name, r.storeName].some((t) => t?.toLowerCase().includes(q)));
    const by = {
      joined: (a, b) => (b.joinedAt ?? '').localeCompare(a.joinedAt ?? ''),
      login: (a, b) => (b.lastLoginAt ?? '').localeCompare(a.lastLoginAt ?? ''),
      reviews: (a, b) => b.reviewCount - a.reviewCount,
    }[sort];
    return [...list].sort(by);
  }, [rows, query, sort]);

  function onUpdated(row) {
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...row } : r)));
    onChanged();
  }

  return (
    <div className={`admin-split ${selected ? 'has-detail' : ''}`}>
      <section className="ap-panel ap-table-panel">
        <div className="ap-toolbar">
          <FormInput icon="search" label="회원 검색" hideLabel type="search" placeholder="이름, 이메일, 매장명" value={query}
                     fieldClassName="ap-search" onChange={(e) => setQuery(e.target.value)} />
          <FormSelect label="상태" hideLabel value={status} onChange={(e) => setStatus(e.target.value)}
                      options={[['', '전체 상태'], ...Object.entries(USER_STATUS).map(([k, [l]]) => [k, l])]} />
          <FormSelect label="정렬" hideLabel value={sort} onChange={(e) => setSort(e.target.value)} options={SORTS} />
          <span className="ap-count">{rows ? `${shown.length}명` : ''}</span>
        </div>
        {error && <Alert>{error}</Alert>}
        {!rows ? <p className="hint ap-pad">불러오는 중…</p> : shown.length === 0 ? (
          <p className="ap-empty ap-pad">조건에 맞는 회원이 없습니다.</p>
        ) : (
          <div className="ap-table-wrap">
            <table className="ap-table">
              <thead>
                <tr><th scope="col">회원</th><th scope="col">매장</th><th scope="col">가입일</th><th scope="col">최근 로그인</th>
                  <th scope="col" className="num">리뷰</th><th scope="col">상태</th></tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className={selected === r.id ? 'is-selected' : undefined} onClick={() => setSelected(r.id)}>
                    <td>
                      <button type="button" className="row-btn" onClick={() => setSelected(r.id)}>
                        <strong>{r.name || '(이름 없음)'}{r.role === 'ADMIN' && <span className="role-chip">관리자</span>}</strong>
                        <small>{r.email}</small>
                      </button>
                    </td>
                    <td>{r.storeName ?? <span className="muted">매장 없음</span>}</td>
                    <td className="tabnum">{dateOnly(r.joinedAt)}</td>
                    <td className="tabnum">{r.lastLoginAt ? formatDateTime(r.lastLoginAt) : <span className="muted">없음</span>}</td>
                    <td className="num">{r.reviewCount}</td>
                    <td><StatusChip status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {selected && (
        <MemberDetail key={selected} id={selected} me={me} toast={toast} onClose={() => setSelected(null)} onUpdated={onUpdated} />
      )}
    </div>
  );
}

function StatusChip({ status }) {
  const [label, tone] = USER_STATUS[status] ?? [status, ''];
  return <span className={`status-chip ${tone}`}>{label}</span>;
}

function MemberDetail({ id, me, toast, onClose, onUpdated }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    admin.user(id).then(setD).catch((e) => setError(e.message));
  }, [id]);

  async function change(active) {
    setBusy(true);
    try {
      const row = await admin.setUserActive(id, active);
      setD((x) => ({ ...x, user: row, disabledAt: active ? null : new Date().toISOString() }));
      onUpdated(row);
      setAsking(false);
      toast.show(active ? '계정 이용을 다시 허용했습니다.' : '계정 이용을 중지했습니다.');
    } catch (e) {
      toast.show(e.message);
    } finally {
      setBusy(false);
    }
  }

  const u = d?.user;
  const self = u && me && u.id === me.id;
  return (
    <aside className="ap-panel ap-detail" aria-label="회원 상세">
      <div className="ap-head">
        <h2>회원 상세</h2>
        <button type="button" className="icon-btn" aria-label="상세 닫기" onClick={onClose}><Icon name="remove" /></button>
      </div>
      {error && <Alert>{error}</Alert>}
      {!d && !error && <p className="hint ap-pad">불러오는 중…</p>}
      {u && (
        <div className="ap-detail-body">
          <div className="member-id">
            <span className="member-avatar" aria-hidden="true">{(u.name || u.email).slice(0, 1)}</span>
            <div>
              <strong>{u.name || '(이름 없음)'}{u.role === 'ADMIN' && <span className="role-chip">관리자</span>}</strong>
              <small>{u.email}</small>
            </div>
            <StatusChip status={u.status} />
          </div>
          <dl className="kv">
            <div><dt>가입일</dt><dd>{formatDateTime(u.joinedAt)}</dd></div>
            <div><dt>최근 로그인</dt><dd>{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '없음'}</dd></div>
            <div><dt>등록 리뷰</dt><dd>{u.reviewCount}건</dd></div>
            {d.disabledAt && <div><dt>이용 중지</dt><dd>{formatDateTime(d.disabledAt)}</dd></div>}
          </dl>
          <h3>매장</h3>
          {d.stores.length === 0 ? <p className="hint">등록한 매장이 없습니다.</p> : (
            <table className="ap-table is-compact">
              <thead><tr><th scope="col">매장</th><th scope="col" className="num">리뷰</th><th scope="col" className="num">작성 완료</th><th scope="col">답글 스타일</th></tr></thead>
              <tbody>
                {d.stores.map((s) => (
                  <tr key={s.id}><td>{s.name}<small className="muted"> {s.category}</small></td><td className="num">{s.reviews}</td>
                    <td className="num">{s.completed}</td><td>{s.styleReady ? '저장됨' : <span className="muted">미설정</span>}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <h3>최근 문의</h3>
          {d.inquiries.length === 0 ? <p className="hint">남긴 문의가 없습니다.</p> : (
            <ul className="ap-list is-compact">
              {d.inquiries.map((q) => (
                <li key={q.id}>
                  <span className="mono-no">{inquiryNo(q.id)}</span>
                  <span className="ap-list-main"><strong>{q.title}</strong></span>
                  <span className="ap-list-end">{STATUS[q.status]?.[0] ?? q.status}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="danger-box">
            {self ? (
              <p className="hint">지금 로그인한 관리자 계정은 이용 중지할 수 없습니다.</p>
            ) : u.status === 'DISABLED' ? (
              <>
                <p className="hint">이 계정은 로그인할 수 없습니다. 다시 허용하면 기존 비밀번호로 로그인할 수 있습니다.</p>
                <PrimaryButton icon="confirm" onClick={() => change(true)} loading={busy} loadingText="처리 중">다시 이용 허용</PrimaryButton>
              </>
            ) : asking ? (
              <div className="confirm-box" role="alertdialog" aria-label="이용 중지 확인">
                <strong>{u.name || u.email} 계정의 이용을 중지할까요?</strong>
                <ul>
                  <li>지금 로그인한 상태가 바로 풀리고, 다시 로그인할 수 없습니다.</li>
                  <li>매장·리뷰·답글 데이터는 지우지 않습니다. 언제든 다시 허용할 수 있습니다.</li>
                </ul>
                <div className="end">
                  <SecondaryButton tone="neutral" onClick={() => setAsking(false)} disabled={busy}>취소</SecondaryButton>
                  <button type="button" className="btn btn-danger" onClick={() => change(false)} disabled={busy} autoFocus>
                    {busy ? '처리 중…' : '이용 중지'}
                  </button>
                </div>
              </div>
            ) : (
              <SecondaryButton tone="neutral" icon="lock" className="btn-danger-outline" onClick={() => setAsking(true)}>계정 이용 중지</SecondaryButton>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

/* ── 문의 관리 ─────────────────────────────────────────── */

function Inquiries({ toast, stamp, onChanged }) {
  const [filter, setFilter] = useState({ status: '', type: '' });
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('new');
  const [items, setItems] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await admin.inquiries(filter));
    } catch (e) {
      setError(e.message);
    }
  }, [filter]);
  useEffect(() => {
    load();
  }, [load, stamp]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (items ?? []).filter((x) => !q || [x.title, x.content, x.userEmail, inquiryNo(x.id)].some((t) => t?.toLowerCase().includes(q)));
    return sort === 'new' ? list : [...list].reverse();
  }, [items, query, sort]);

  function onSaved(updated) {
    setItems((list) => list.map((q) => (q.id === updated.id ? updated : q)));
    setSelected(updated);
    onChanged();
    toast.show('저장했습니다.');
  }

  return (
    <div className={`admin-split ${selected ? 'has-detail' : ''}`}>
      <section className="ap-panel ap-table-panel">
        <div className="ap-toolbar">
          <FormInput icon="search" label="문의 검색" hideLabel type="search" placeholder="접수 번호, 제목, 내용, 이메일" value={query}
                     fieldClassName="ap-search" onChange={(e) => setQuery(e.target.value)} />
          <FormSelect label="상태" hideLabel value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}
                      options={[['', '전체 상태'], ...Object.entries(STATUS).map(([k, [l]]) => [k, l])]} />
          <FormSelect label="유형" hideLabel value={filter.type} onChange={(e) => setFilter((f) => ({ ...f, type: e.target.value }))}
                      options={[['', '전체 유형'], ...INQUIRY_TYPES.map(([k, l]) => [k, l])]} />
          <FormSelect label="정렬" hideLabel value={sort} onChange={(e) => setSort(e.target.value)}
                      options={[['new', '최신 접수순'], ['old', '오래된 접수순']]} />
          <span className="ap-count">{items ? `${shown.length}건` : ''}</span>
        </div>
        {error && <Alert>{error}</Alert>}
        {!items ? <p className="hint ap-pad">불러오는 중…</p> : shown.length === 0 ? (
          <p className="ap-empty ap-pad">조건에 맞는 문의가 없습니다.</p>
        ) : (
          <div className="ap-table-wrap">
            <table className="ap-table">
              <thead>
                <tr><th scope="col">접수 번호</th><th scope="col">유형</th><th scope="col">제목</th><th scope="col">회원</th>
                  <th scope="col">발생 위치</th><th scope="col">접수일</th><th scope="col">상태</th></tr>
              </thead>
              <tbody>
                {shown.map((q) => (
                  <tr key={q.id} className={selected?.id === q.id ? 'is-selected' : undefined} onClick={() => setSelected(q)}>
                    <td className="mono-no">{inquiryNo(q.id)}</td>
                    <td>{TYPE_LABEL[q.type] ?? q.type}</td>
                    <td>
                      <button type="button" className="row-btn" onClick={() => setSelected(q)}>
                        <strong>{q.title}{q.attachmentName && <Icon name="attach" size={14} />}</strong>
                      </button>
                    </td>
                    <td className="ellipsis">{q.userEmail}</td>
                    <td>{q.location ?? <span className="muted">-</span>}</td>
                    <td className="tabnum">{formatDateTime(q.createdAt)}</td>
                    <td><span className={`inquiry-status is-${q.status.toLowerCase()}`}>{STATUS[q.status]?.[0] ?? q.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {selected && (
        <InquiryDetail key={`${selected.id}-${selected.status}`} q={selected} onSaved={onSaved} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function InquiryDetail({ q, onSaved, onClose }) {
  const [status, setStatus] = useState(q.status);
  const [answer, setAnswer] = useState(q.answer ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const text = answer.trim();
      // 답변을 쓰면 서버가 '답변 완료'로 바꾸고 문의자에게 메일로 알린다
      onSaved(await admin.handle(q.id, text ? 'ANSWERED' : status, text || null));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="ap-panel ap-detail" aria-label="문의 상세">
      <div className="ap-head">
        <h2><span className="mono-no">{inquiryNo(q.id)}</span> {TYPE_LABEL[q.type] ?? q.type}</h2>
        <button type="button" className="icon-btn" aria-label="상세 닫기" onClick={onClose}><Icon name="remove" /></button>
      </div>
      <div className="ap-detail-body">
        <div>
          <h3 className="admin-detail-title">{q.title}</h3>
          <p className="hint meta-row"><span>{q.userEmail}</span><span>{formatDateTime(q.createdAt)}</span></p>
          <InquiryMeta q={q} />
        </div>
        <p className="inquiry-content">{q.content}</p>
        {q.attachmentName && (
          <a className="admin-attach" href={admin.attachmentUrl(q.id)} target="_blank" rel="noreferrer">
            <img src={admin.attachmentUrl(q.id)} alt={`첨부 이미지 ${q.attachmentName}`} />
            <span className="hint"><Icon name="attach" size={14} />{q.attachmentName}</span>
          </a>
        )}
        <FormSelect label="처리 상태" value={status} onChange={(e) => setStatus(e.target.value)}
                    options={Object.entries(STATUS).map(([k, [l]]) => [k, l])} disabled={!!answer.trim()}
                    hint={answer.trim() ? '답변을 저장하면 답변 완료로 바뀝니다.' : undefined} />
        <FormInput multiline rows={6} label="관리자 답변" value={answer} maxLength={3000} counter={`${answer.length}/3000`}
                   onChange={(e) => setAnswer(e.target.value)} placeholder="답변을 저장하면 문의자에게 메일로 알립니다." />
        {error && <Alert>{error}</Alert>}
        <div className="end">
          <PrimaryButton icon="save" onClick={save} loading={busy} loadingText="저장 중">
            {answer.trim() ? '답변 저장하고 완료 처리' : '상태 저장'}
          </PrimaryButton>
        </div>
      </div>
    </aside>
  );
}

/* ── 답글 피드백 (사장님이 남긴 개선 요청·좋아요) ─────────────────── */

function Feedback({ stamp }) {
  const [value, setValue] = useState('DOWN');
  const [reason, setReason] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    setRows(null);
    setError(null);
    admin.feedback({ value, reason: value === 'DOWN' ? reason : '' }).then(setRows).catch((e) => setError(e.message));
  }, [value, reason, stamp]);

  return (
    <div className={`admin-split ${selected ? 'has-detail' : ''}`}>
      <section className="ap-panel ap-table-panel">
        <div className="ap-toolbar">
          <div className="seg ap-seg ap-seg-3" role="group" aria-label="평가">
            {[['DOWN', '개선 요청'], ['UP', '마음에 들어요'], ['', '전체']].map(([k, l]) => (
              <button key={k} type="button" className="seg-btn" aria-pressed={value === k}
                      onClick={() => { setValue(k); setSelected(null); }}>{l}</button>
            ))}
          </div>
          {value === 'DOWN' && (
            <FormSelect label="개선 이유" hideLabel value={reason} onChange={(e) => { setReason(e.target.value); setSelected(null); }}
                        options={[['', '모든 이유'], ...Object.entries(REASON_LABEL)]} />
          )}
          <span className="ap-count">{rows ? `${rows.length}건${rows.length >= 100 ? ' (최근 100건)' : ''}` : ''}</span>
        </div>
        {error && <Alert>{error}</Alert>}
        {!rows && !error ? <p className="hint ap-pad">불러오는 중…</p> : rows?.length === 0 ? (
          <p className="ap-empty ap-pad">조건에 맞는 피드백이 없습니다.</p>
        ) : rows && (
          <div className="ap-table-wrap">
            <table className="ap-table">
              <thead>
                <tr><th scope="col">받은 시각</th><th scope="col">평가</th><th scope="col">말투</th><th scope="col">이유·의견</th><th scope="col">매장</th></tr>
              </thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.replyId} className={selected?.replyId === f.replyId ? 'is-selected' : undefined} onClick={() => setSelected(f)}>
                    <td className="tabnum">{formatDateTime(f.feedbackAt)}</td>
                    <td><FeedbackChip value={f.value} /></td>
                    <td>{TONE_LABEL[f.tone] ?? f.tone}</td>
                    <td>
                      <button type="button" className="row-btn fb-cell" onClick={() => setSelected(f)}>
                        {f.reasons.length > 0 && <span className="fb-reasons">{f.reasons.map((x) => REASON_LABEL[x] ?? x).join(', ')}</span>}
                        <small>{f.comment || (f.value === 'DOWN' ? '남긴 의견 없음' : '')}</small>
                      </button>
                    </td>
                    <td className="ellipsis">{f.storeName}<small className="muted"> {f.ownerEmail}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {selected && (
        <aside className="ap-panel ap-detail" aria-label="피드백 상세">
          <div className="ap-head">
            <h2>피드백 상세</h2>
            <button type="button" className="icon-btn" aria-label="상세 닫기" onClick={() => setSelected(null)}><Icon name="remove" /></button>
          </div>
          <div className="ap-detail-body">
            <p className="meta-row hint"><FeedbackChip value={selected.value} /><span>{formatDateTime(selected.feedbackAt)}</span><span>{selected.storeName}, {selected.ownerEmail}</span></p>
            {selected.value === 'DOWN' && (
              <div className="fb-box">
                <h3>개선 이유</h3>
                {selected.reasons.length ? (
                  <div className="tags">{selected.reasons.map((x) => <span key={x} className="tag">{REASON_LABEL[x] ?? x}</span>)}</div>
                ) : <p className="hint">고른 이유 없음</p>}
                <h3>사장님 의견</h3>
                <p className="fb-comment">{selected.comment || '남긴 의견이 없습니다.'}</p>
              </div>
            )}
            <h3>손님 리뷰</h3>
            <div className="fb-quote">
              <p className="hint meta-row">
                <span className="fb-stars" aria-label={`별점 ${selected.rating}점`}>{'★'.repeat(selected.rating)}<span>{'★'.repeat(5 - selected.rating)}</span></span>
                {selected.reviewType && <span>{REVIEW_TYPE_LABEL[selected.reviewType] ?? selected.reviewType}</span>}
              </p>
              <p>{selected.reviewText || '본문 없이 별점만 남긴 리뷰'}</p>
            </div>
            <h3>
              평가한 답글 ({TONE_LABEL[selected.tone] ?? selected.tone})
              {selected.isFinal && <span className="status-chip is-ok">최종 답글</span>}
              {selected.edited && <span className="status-chip is-wait">사장님이 고침</span>}
            </h3>
            <p className="fb-quote is-reply">{selected.replyText}</p>
            <p className="hint">리뷰는 개인정보를 가린 본문입니다.</p>
          </div>
        </aside>
      )}
    </div>
  );
}

function FeedbackChip({ value }) {
  return value === 'DOWN'
    ? <span className="status-chip is-warn">개선 요청</span>
    : <span className="status-chip is-ok">마음에 들어요</span>;
}

/* ── 서비스 모니터링 ─────────────────────────────────────── */

function Monitoring({ o, stamp }) {
  const [failedOnly, setFailedOnly] = useState(true);
  const [logs, setLogs] = useState(null);
  const [openId, setOpenId] = useState(null);
  useEffect(() => {
    setLogs(null);
    admin.aiLogs({ failedOnly, limit: 50 }).then(setLogs).catch(() => setLogs([]));
  }, [failedOnly, stamp]);
  const s = o.system;
  const rate = pct(s.aiFailures24h, s.aiCalls24h);
  const aiTone = !s.aiCalls24h ? 'is-wait' : rate >= 30 ? 'is-bad' : rate >= 10 ? 'is-warn' : 'is-ok';
  return (
    <>
      <section className="ap-panel">
        <div className="ap-head"><h2>시스템 상태</h2><span className="hint">새로고침한 시점 기준</span></div>
        <ul className="sys-list">
          <SysRow label="데이터베이스" tone={s.database ? 'is-ok' : 'is-bad'} value={s.database ? '정상 연결' : '연결 실패'} />
          <SysRow label="OpenAI API 키" tone={s.openAiConfigured ? 'is-ok' : 'is-bad'}
                  value={s.openAiConfigured ? '설정됨' : '없음: 분류·답글 생성이 모두 실패합니다'} />
          <SysRow label="메일 발송 (SMTP)" tone={s.mailConfigured ? 'is-ok' : 'is-bad'}
                  value={s.mailConfigured ? '설정됨' : '없음: 가입 인증·비밀번호 재설정·답변 알림 메일을 보낼 수 없습니다'} />
          <SysRow label="AI 호출 (최근 24시간)" tone={aiTone}
                  value={s.aiCalls24h ? `${s.aiCalls24h}건 중 실패 ${s.aiFailures24h}건 (${rate}%)` : '호출 없음'} />
          <SysRow label="마지막 AI 성공" tone="is-plain" value={s.lastAiSuccessAt ? formatDateTime(s.lastAiSuccessAt) : '기록 없음'} />
          <SysRow label="마지막 AI 실패" tone="is-plain" value={s.lastAiFailureAt ? formatDateTime(s.lastAiFailureAt) : '기록 없음'} />
        </ul>
        <p className="hint">AI 호출 기록은 {o.aiLogSince ? `${formatDateTime(o.aiLogSince)}부터` : '기록 기능을 켠 뒤부터'} 쌓입니다. 프롬프트와 리뷰 본문은 남기지 않습니다.</p>
      </section>

      <section className="ap-panel">
        <div className="ap-head"><h2>작업별 AI 호출 성공·실패</h2><span className="hint">최근 7일</span></div>
        {o.aiByKind.length === 0 ? <p className="ap-empty">최근 7일 동안 AI 호출이 없습니다.</p> : (
          <table className="ap-table is-compact">
            <thead><tr><th scope="col">작업</th><th scope="col" className="num">성공</th><th scope="col" className="num">실패</th><th scope="col">실패율</th></tr></thead>
            <tbody>
              {o.aiByKind.map((k) => {
                const r = pct(k.failure, k.success + k.failure);
                return (
                  <tr key={k.kind}>
                    <td>{kindLabel(k.kind)}</td><td className="num">{k.success}</td><td className="num">{k.failure}</td>
                    <td><span className="rate-bar"><span style={{ width: `${r}%` }} className={r >= 30 ? 'is-bad' : r >= 10 ? 'is-warn' : ''} /></span>{r}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="ap-panel ap-table-panel">
        <div className="ap-toolbar">
          <h2>AI 호출 기록</h2>
          <div className="seg ap-seg" role="group" aria-label="기록 범위">
            <button type="button" className="seg-btn" aria-pressed={failedOnly} onClick={() => setFailedOnly(true)}>실패만</button>
            <button type="button" className="seg-btn" aria-pressed={!failedOnly} onClick={() => setFailedOnly(false)}>전체</button>
          </div>
          <span className="ap-count">최근 50건까지</span>
        </div>
        {!logs ? <p className="hint ap-pad">불러오는 중…</p> : logs.length === 0 ? (
          <p className="ap-empty ap-pad"><Icon name="confirm" size={16} />{failedOnly ? '기록된 실패가 없습니다.' : '기록이 없습니다.'}</p>
        ) : (
          <div className="ap-table-wrap">
            <table className="ap-table">
              <thead><tr><th scope="col">발생 시각</th><th scope="col">작업</th><th scope="col">결과</th><th scope="col">오류 코드</th>
                <th scope="col" className="num">소요</th><th scope="col">모델</th></tr></thead>
              <tbody>
                {logs.map((l) => [
                  <tr key={l.id} className={openId === l.id ? 'is-selected' : undefined}
                      onClick={() => !l.success && setOpenId(openId === l.id ? null : l.id)}>
                    <td className="tabnum">{formatDateTime(l.createdAt)}</td>
                    <td>{kindLabel(l.kind)}</td>
                    <td>{l.success ? <span className="status-chip is-ok">성공</span> : <span className="status-chip is-bad">실패</span>}</td>
                    <td>
                      {l.errorCode ? (
                        <button type="button" className="row-btn code-btn" aria-expanded={openId === l.id}>
                          <span className="code-chip is-bad">{l.errorCode}</span>
                        </button>
                      ) : <span className="muted">-</span>}
                    </td>
                    <td className="num tabnum">{(l.durationMs / 1000).toFixed(1)}초</td>
                    <td className="muted">{l.model ?? '-'}</td>
                  </tr>,
                  openId === l.id && (
                    <tr key={`${l.id}-d`} className="ap-row-detail">
                      <td colSpan={6}><strong>오류 상세</strong>{l.errorMessage ?? '메시지 없음'}</td>
                    </tr>
                  ),
                ])}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function SysRow({ label, value, tone }) {
  return (
    <li>
      <span className={`sys-dot ${tone}`} aria-hidden="true" />
      <span className="sys-label">{label}</span>
      <span className="sys-value">{value}</span>
    </li>
  );
}

/* ── 운영 통계 ─────────────────────────────────────────── */

function Stats({ o, stamp }) {
  const [period, setPeriod] = useState('day');
  const [st, setSt] = useState(null);
  useEffect(() => {
    admin.stats().then(setSt).catch(() => setSt(null));
  }, [stamp]);
  const feedback = st;
  const statusLabels = Object.fromEntries(Object.entries(STATUS).map(([k, [l]]) => [k, l]));
  const days = o.daily;
  const sum = (list, k) => list.reduce((n, d) => n + d[k], 0);
  const lastWeek = days.slice(0, 7);
  const thisWeek = days.slice(7);
  const weekRows = [
    ['리뷰 등록', 'reviews'],
    ['리뷰를 등록한 회원 (일별 합)', 'activeUsers'],
    ['신규 가입', 'signups'],
    ['AI 호출', 'aiCalls'],
    ['AI 호출 실패', 'aiFailures'],
  ];
  const fbTotal = feedback ? feedback.feedbackUp + feedback.feedbackDown : 0;
  return (
    <>
      <section className="ap-panel">
        <div className="ap-head">
          <h2>서비스 이용량</h2>
          <div className="seg ap-seg" role="group" aria-label="기간 단위">
            <button type="button" className="seg-btn" aria-pressed={period === 'day'} onClick={() => setPeriod('day')}>일별 (14일)</button>
            <button type="button" className="seg-btn" aria-pressed={period === 'week'} onClick={() => setPeriod('week')}>주별 (최근 2주)</button>
          </div>
        </div>
        {period === 'day' ? (
          <div className="mini-grid">
            <MiniColumns title="리뷰 등록" days={days} keyName="reviews" unit="건" />
            <MiniColumns title="리뷰를 등록한 회원 (사용자 활동)" days={days} keyName="activeUsers" unit="명" />
            <MiniColumns title="신규 가입" days={days} keyName="signups" unit="명" />
            <MiniColumns title="AI 호출 (빨강: 실패)" days={days} keyName="aiCalls" failKey="aiFailures" unit="건" />
          </div>
        ) : (
          <table className="ap-table is-compact">
            <thead><tr><th scope="col">항목</th><th scope="col" className="num">지난 7일 전</th><th scope="col" className="num">최근 7일</th><th scope="col" className="num">변화</th></tr></thead>
            <tbody>
              {weekRows.map(([label, k]) => {
                const a = sum(lastWeek, k);
                const b = sum(thisWeek, k);
                const bad = k === 'aiFailures';
                const tone = b === a ? '' : (b > a) !== bad ? 'is-good' : 'is-bad';
                return (
                  <tr key={k}><td>{label}</td><td className="num">{a}</td><td className="num"><strong>{b}</strong></td>
                    <td className={`num delta ${tone}`}>{b === a ? '같음' : `${b > a ? '▲' : '▼'} ${Math.abs(b - a)}`}</td></tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <div className="admin-2col">
        <section className="ap-panel">
          <div className="ap-head"><h2>기능별 이용 현황</h2><span className="hint">최근 7일 AI 호출 기준</span></div>
          {o.aiByKind.length === 0 ? <p className="ap-empty">최근 7일 동안 AI 기능 이용이 없습니다.</p> : (
            <Bars data={Object.fromEntries(o.aiByKind.map((k) => [k.kind, k.success + k.failure]))} labels={KIND_LABEL} />
          )}
          <dl className="kv is-inline">
            <div><dt>작성 완료한 답글 (7일)</dt><dd>{o.completed7d}건</dd></div>
            <div><dt>리뷰 등록 (7일)</dt><dd>{o.reviews7d}건</dd></div>
          </dl>
        </section>
        <section className="ap-panel">
          <div className="ap-head"><h2>답글 품질 피드백</h2><span className="hint">전체 기간</span></div>
          {!feedback ? <p className="hint">불러오는 중…</p> : fbTotal === 0 ? <p className="ap-empty">아직 받은 피드백이 없습니다.</p> : (
            <>
              <p className="fb-line"><strong>{pct(feedback.feedbackUp, fbTotal)}%</strong> 마음에 들어요
                <span className="muted"> (좋아요 {feedback.feedbackUp}, 개선 요청 {feedback.feedbackDown})</span></p>
              <h3>개선 요청 이유</h3>
              <Bars data={feedback.downReasons} labels={REASON_LABEL} />
              <h3>개선 요청이 많은 말투</h3>
              <Bars data={feedback.downByTone} labels={TONE_LABEL} />
            </>
          )}
        </section>
      </div>

      <section className="ap-panel">
        <div className="ap-head">
          <h2>문의 현황</h2>
          <span className="hint">{st ? `전체 ${st.inquiries}건, 최근 7일 ${st.lastSevenDays}건 접수` : ''}</span>
        </div>
        {!st ? <p className="hint">불러오는 중…</p> : st.inquiries === 0 ? <p className="ap-empty">아직 접수된 문의가 없습니다.</p> : (
          <div className="inq-stats">
            <div><h3>처리 상태</h3><Bars data={st.byStatus} labels={statusLabels} /></div>
            <div><h3>유형</h3><Bars data={st.byType} labels={TYPE_LABEL} /></div>
            <div><h3>발생 위치</h3><Bars data={st.byLocation} /></div>
          </div>
        )}
      </section>
    </>
  );
}

/** 14일 작은 막대 (작은 여러 장으로 나란히). 마우스를 올리거나 초점을 주면 그날 값 */
function MiniColumns({ title, days, keyName, failKey, unit }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...days.map((d) => d[keyName]));
  const total = days.reduce((n, d) => n + d[keyName], 0);
  const h = hover != null ? days[hover] : null;
  return (
    <figure className="mini">
      <figcaption>
        <span>{title}</span>
        <strong>{h ? `${h.date.slice(5).replace('-', '.')} ${h[keyName]}${unit}` : `합계 ${total}${unit}`}</strong>
      </figcaption>
      <div className="mini-plot" onMouseLeave={() => setHover(null)}>
        {days.map((d, i) => {
          const fail = failKey ? d[failKey] : 0;
          return (
            <span key={d.date} className="mini-col" tabIndex={0} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                  aria-label={`${d.date} ${d[keyName]}${unit}${failKey ? `, 실패 ${fail}건` : ''}`}>
              <span className="mini-bar" style={{ height: `${(d[keyName] / max) * 100}%` }}>
                {fail > 0 && <span className="mini-fail" style={{ flexGrow: fail }} />}
                {d[keyName] - fail > 0 && <span className="mini-ok" style={{ flexGrow: d[keyName] - fail }} />}
              </span>
            </span>
          );
        })}
      </div>
      <div className="mini-axis" aria-hidden="true"><span>{days[0].date.slice(5).replace('-', '.')}</span><span>오늘</span></div>
    </figure>
  );
}

function Bars({ data, labels = {} }) {
  const entries = Object.entries(data ?? {}).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (entries.length === 0) return <p className="hint">아직 없습니다.</p>;
  return (
    <ul className="bars">
      {entries.map(([k, v]) => (
        <li key={k}>
          <span className="bars-label">{labels[k] ?? k}</span>
          <span className="bars-track"><span className="bars-fill" style={{ width: `${(v / max) * 100}%` }} /></span>
          <span className="bars-value">{v}</span>
        </li>
      ))}
    </ul>
  );
}
