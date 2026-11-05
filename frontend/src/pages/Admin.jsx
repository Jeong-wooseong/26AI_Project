// 관리자: 접수된 문의 확인·답변·상태 변경, 문의 유형별 통계, 답글 피드백 통계
import { useCallback, useEffect, useState } from 'react';
import { admin } from '../api.js';
import Icon from '../components/Icon.jsx';
import {
  Alert, EmptyState, FormInput, FormSelect, PageHeader, PrimaryButton, SecondaryButton, StatusIndicator,
} from '../components/ui.jsx';
import { TONE_LABEL, formatDateTime } from '../components/reply/replyModel.js';
import { INQUIRY_TYPES, InquiryMeta, STATUS, TYPE_LABEL } from './Support.jsx';

export const REASON_LABEL = {
  CONTENT_MISMATCH: '리뷰 내용과 맞지 않음',
  AWKWARD_TONE: '말투가 어색함',
  WRONG_FACT: '사실과 다른 내용',
  LENGTH: '너무 길거나 짧음',
  OTHER: '기타',
};

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

export default function Admin({ toast }) {
  const [stats, setStats] = useState(null);
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState({ status: '', type: '' });
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, list] = await Promise.all([admin.stats(), admin.inquiries(filter)]);
      setStats(s);
      setItems(list);
    } catch (e) {
      setError(e.message);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  function onSaved(updated) {
    setItems((list) => list.map((q) => (q.id === updated.id ? updated : q)));
    setSelected(updated);
    admin.stats().then(setStats).catch(() => {});
    toast.show('저장했습니다.');
  }

  const statusLabels = Object.fromEntries(Object.entries(STATUS).map(([k, [l]]) => [k, l]));
  const fbTotal = stats ? stats.feedbackUp + stats.feedbackDown : 0;

  return (
    <>
      <PageHeader title="관리자" description="고객 문의를 처리하고 오류·피드백 현황을 봅니다. 관리자 계정에만 보입니다."
                  actions={<SecondaryButton tone="neutral" icon="retry" onClick={load}>새로고침</SecondaryButton>} />
      {error && <Alert>{error}</Alert>}
      {stats && (
        <div className="admin-stats">
          <section className="section stat-card">
            <h2>문의</h2>
            <p className="stat-big">{stats.inquiries}<span>건</span></p>
            <p className="hint">최근 7일 {stats.lastSevenDays}건</p>
            <Bars data={stats.byStatus} labels={statusLabels} />
          </section>
          <section className="section stat-card">
            <h2>유형별</h2>
            <Bars data={stats.byType} labels={TYPE_LABEL} />
            <h3>발생 위치</h3>
            <Bars data={stats.byLocation} />
          </section>
          <section className="section stat-card">
            <h2>답글 피드백</h2>
            <p className="stat-big">
              {fbTotal ? Math.round((stats.feedbackUp / fbTotal) * 100) : 0}<span>% 마음에 들어요</span>
            </p>
            <p className="hint meta-row"><span>마음에 들어요 {stats.feedbackUp}</span><span>개선하고 싶어요 {stats.feedbackDown}</span></p>
            <h3>개선 이유</h3>
            <Bars data={stats.downReasons} labels={REASON_LABEL} />
            <h3>개선 요청 말투</h3>
            <Bars data={stats.downByTone} labels={TONE_LABEL} />
          </section>
        </div>
      )}

      <div className="admin-grid">
        <section className="section admin-list">
          <div className="section-toolbar admin-filters">
            <FormSelect label="상태" value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}
                        options={[['', '전체'], ...Object.entries(STATUS).map(([k, [l]]) => [k, l])]} />
            <FormSelect label="유형" value={filter.type} onChange={(e) => setFilter((f) => ({ ...f, type: e.target.value }))}
                        options={[['', '전체'], ...INQUIRY_TYPES.map(([k, l]) => [k, l])]} />
          </div>
          {!items ? (
            <EmptyState loading description="불러오는 중…" />
          ) : items.length === 0 ? (
            <p className="dt-empty">조건에 맞는 문의가 없습니다.</p>
          ) : (
            <ul className="admin-items">
              {items.map((q) => {
                const [label, tone] = STATUS[q.status] ?? [q.status, 'neutral'];
                return (
                  <li key={q.id}>
                    <button type="button" className={`admin-item ${selected?.id === q.id ? 'is-selected' : ''}`}
                            onClick={() => setSelected(q)}>
                      <span className="admin-item-top">
                        <span className="tag">{TYPE_LABEL[q.type] ?? q.type}</span>
                        <StatusIndicator tone={tone}>{label}</StatusIndicator>
                        {q.attachmentName && <Icon name="attach" size={14} />}
                      </span>
                      <span className="admin-item-title">{q.title}</span>
                      <span className="hint meta-row"><span>{q.userEmail}</span><span>{formatDateTime(q.createdAt)}</span></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        {selected ? (
          <InquiryDetail key={`${selected.id}-${selected.status}`} q={selected} onSaved={onSaved} />
        ) : (
          <EmptyState title="문의를 선택하십시오" description="왼쪽 목록에서 문의를 고르면 내용과 답변 칸이 나타납니다." />
        )}
      </div>
    </>
  );
}

function InquiryDetail({ q, onSaved }) {
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
    <section className="section admin-detail">
      <div className="section-body">
        <div>
          <span className="tag">{TYPE_LABEL[q.type] ?? q.type}</span>
          <h2 className="admin-detail-title">{q.title}</h2>
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
        <FormInput multiline rows={6} label="답변" value={answer} maxLength={3000} counter={`${answer.length}/3000`}
                   onChange={(e) => setAnswer(e.target.value)} placeholder="답변을 저장하면 문의자에게 메일로 알립니다." />
        {error && <Alert>{error}</Alert>}
      </div>
      <div className="section-foot">
        <div className="end">
          <PrimaryButton icon="save" onClick={save} loading={busy} loadingText="저장 중">저장</PrimaryButton>
        </div>
      </div>
    </section>
  );
}
