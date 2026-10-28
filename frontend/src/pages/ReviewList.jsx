import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { PLATFORM_LABEL, SENTIMENT_LABEL, TYPES, TYPE_LABEL, stars, todayISO } from '../labels.js';
import Spinner from '../components/Spinner.jsx';

/** 화면 ③ 오늘의 리뷰: 분류 결과, 평점만 리뷰의 템플릿 답글, 실패 시 다시 시도 */
export default function ReviewList({ store, toast, go }) {
  const [date, setDate] = useState(todayISO());
  const [filter, setFilter] = useState('ALL');
  const [reviews, setReviews] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setReviews(await api.listReviews(store.id, { date }));
    } catch (e) {
      setError(e.message);
    }
  }, [store.id, date]);

  useEffect(() => {
    setReviews(null);
    load();
  }, [load]);

  const replace = (updated) => setReviews((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));

  const counts = (reviews ?? []).reduce((m, r) => {
    const key = r.type ?? 'FAILED';
    m[key] = (m[key] ?? 0) + 1;
    return m;
  }, {});
  const failedCount = (reviews ?? []).filter((r) => r.status === 'FAILED').length;
  const visible = (reviews ?? []).filter((r) =>
    filter === 'ALL' ? true : filter === 'FAILED' ? r.status === 'FAILED' : r.type === filter);

  return (
    <>
      <div className="head">
        <div>
          <h1>오늘의 리뷰 {reviews && <span className="note">{reviews.length}개</span>}</h1>
          <p>AI가 분류한 결과를 확인하세요. 평점만 리뷰는 바로 답글을 복사할 수 있어요.</p>
        </div>
        <div className="row">
          <label className="label" htmlFor="date">날짜</label>
          <input id="date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
          <button className="btn primary" onClick={() => go('input')}>리뷰 입력</button>
        </div>
      </div>

      {error && (
        <div className="error-box" role="alert">
          {error} <button className="link-btn" onClick={load}>다시 불러오기</button>
        </div>
      )}

      {reviews && reviews.length > 0 && (
        <div className="chips" role="group" aria-label="유형 필터">
          <Chip active={filter === 'ALL'} onClick={() => setFilter('ALL')}>전체 {reviews.length}</Chip>
          {TYPES.map(([key, label]) => (
            <Chip key={key} active={filter === key} onClick={() => setFilter(key)}>{label} {counts[key] ?? 0}</Chip>
          ))}
          {failedCount > 0 && (
            <Chip active={filter === 'FAILED'} onClick={() => setFilter('FAILED')}>분류 실패 {failedCount}</Chip>
          )}
        </div>
      )}

      {reviews === null && !error && <div className="empty-state">불러오는 중…</div>}
      {reviews && reviews.length === 0 && (
        <div className="empty-state">
          <p>{date === todayISO() ? '오늘 입력한 리뷰가 없어요.' : '이 날짜에 입력한 리뷰가 없어요.'}</p>
          <button className="btn primary" onClick={() => go('input')}>리뷰 입력하기</button>
        </div>
      )}
      {reviews && reviews.length > 0 && visible.length === 0 && (
        <div className="empty-state">이 유형의 리뷰가 없어요.</div>
      )}

      {visible.map((r) => (
        <ReviewCard key={r.id} review={r} onUpdated={replace} toast={toast} />
      ))}
    </>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button className="chip" aria-pressed={active} onClick={onClick}>{children}</button>
  );
}

function ReviewCard({ review: r, onUpdated, toast }) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState(null);
  const failed = r.status === 'FAILED';

  async function retry() {
    setRetrying(true);
    setRetryError(null);
    try {
      onUpdated(await api.reclassify(r.id));
      toast.show('다시 분류했어요');
    } catch (e) {
      setRetryError(e.message);
    } finally {
      setRetrying(false);
    }
  }

  return (
    <article className={`card ${r.type === 'MALICIOUS' ? 'is-malicious' : ''} ${failed ? 'is-failed' : ''}`}>
      <div className="meta">
        <span className="stars" aria-label={`별점 ${r.rating}점`}>{stars(r.rating)}</span>
        {r.type && <span className={`badge t-${r.type}`}>{TYPE_LABEL[r.type]}</span>}
        {r.sentiment && !failed && <span>{SENTIMENT_LABEL[r.sentiment]}</span>}
        <span>{PLATFORM_LABEL[r.platform]}</span>
        {r.keywords.length > 0 && <span className="kw">#{r.keywords.join(' #')}</span>}
        {r.confidence != null && r.type !== 'RATING_ONLY' && !failed && (
          <span className="mono">확신도 {Math.round(r.confidence * 100)}%</span>
        )}
      </div>

      <p className={`review-text ${r.maskedContent ? '' : 'empty'}`}>
        {r.maskedContent ? <Masked text={r.maskedContent} /> : '본문 없이 별점만 남긴 리뷰'}
      </p>

      {failed && (
        <div className="actions">
          <span className="error-text">
            {r.failureCode === 'LLM_NOT_CONFIGURED'
              ? 'Claude API 키가 설정되지 않아 분류하지 못했어요.'
              : retryError ?? 'AI 응답을 받지 못해 분류하지 못했어요.'}
          </span>
          <button className="btn small" onClick={retry} disabled={retrying}>
            {retrying && <Spinner />} 다시 시도
          </button>
        </div>
      )}

      {r.replies.map((reply) => (
        <TemplateReply key={reply.id} reply={reply} toast={toast} />
      ))}

      {!failed && r.type === 'MALICIOUS' && (
        <p className="note">감정적으로 답하기 전에 대응 방향부터 정해요. 악성 리뷰 대응 가이드는 다음 업데이트에서 추가돼요.</p>
      )}
      {!failed && ['PRAISE', 'COMPLAINT', 'INQUIRY'].includes(r.type) && r.replies.length === 0 && (
        <p className="note">가게 말투로 쓴 답글 초안 3종은 다음 업데이트에서 추가돼요.</p>
      )}
    </article>
  );
}

function TemplateReply({ reply, toast }) {
  const [text, setText] = useState(reply.editedContent ?? reply.content);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(reply.selected);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.show('답글을 복사했어요');
    } catch {
      toast.show('복사가 막혀 있어요. 답글을 직접 선택해 복사해주세요');
    }
    setCopied(true);
    setEditing(false);
    try {
      await api.selectReply(reply.id, text);
    } catch {
      // 기록 실패는 복사에 영향을 주지 않는다
    }
  }

  return (
    <div className="reply-block">
      {editing ? (
        <textarea aria-label="답글 수정" className="reply-edit" value={text} rows={3}
                  onChange={(e) => setText(e.target.value)} />
      ) : (
        <p className="reply">{text}</p>
      )}
      <div className="actions">
        <span className="sim">AI 없이 별점 템플릿으로 만든 초안이에요. 확인 후 사용해주세요</span>
        <div className="row tight">
          <button className="btn small" onClick={() => setEditing(!editing)}>{editing ? '수정 완료' : '수정'}</button>
          <button className="btn small primary" onClick={copy}>{copied ? '복사 완료' : '복사'}</button>
        </div>
      </div>
    </div>
  );
}

/** [전화번호] 같은 가림 표시를 눈에 띄게 */
function Masked({ text }) {
  const parts = text.split(/(\[(?:전화번호|이메일|주소|주문번호|번호)\])/g);
  return parts.map((p, i) => (/^\[.+\]$/.test(p) ? <span key={i} className="mask">{p}</span> : p));
}
