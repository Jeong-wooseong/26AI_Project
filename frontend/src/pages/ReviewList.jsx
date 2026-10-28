import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { PLATFORM_LABEL, SENTIMENT_LABEL, TYPES, TYPE_LABEL, stars, todayISO } from '../labels.js';
import Spinner from '../components/Spinner.jsx';

/** 화면 ③ 오늘의 리뷰: 리뷰 한 건 = 주문 전표 한 장. 분류 결과는 도장으로 찍힌다. */
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

  const list = reviews ?? [];
  const counts = list.reduce((m, r) => {
    if (r.type) m[r.type] = (m[r.type] ?? 0) + 1;
    return m;
  }, {});
  const failedCount = list.filter((r) => r.status === 'FAILED').length;
  const done = list.filter((r) => r.replies.some((p) => p.selected)).length;
  const visible = list.filter((r) =>
    filter === 'ALL' ? true : filter === 'FAILED' ? r.status === 'FAILED' : r.type === filter);
  const isToday = date === todayISO();

  return (
    <>
      <div className="page-head">
        <div className="page-title">
          <h1 className="display">{isToday ? '오늘의 리뷰' : '지난 리뷰'}</h1>
          {reviews && reviews.length > 0 && (
            <p className="tally">
              <strong>{reviews.length}</strong>장 중 <strong>{done}</strong>장 답글 복사
            </p>
          )}
        </div>
        <div className="page-tools">
          <label className="date-field">
            <span className="sr-only">날짜</span>
            <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button className="btn primary" onClick={() => go('input')}>리뷰 입력</button>
        </div>
      </div>

      {error && (
        <div className="error-box" role="alert">
          <span>{error}</span>
          <button className="btn small" onClick={load}>다시 불러오기</button>
        </div>
      )}

      {list.length > 0 && (
        <div className="filters" role="group" aria-label="유형으로 거르기">
          <FilterChip active={filter === 'ALL'} onClick={() => setFilter('ALL')} label="전체" count={list.length} />
          {TYPES.map(([key, label]) => (
            <FilterChip key={key} type={key} active={filter === key} onClick={() => setFilter(key)}
                        label={label} count={counts[key] ?? 0} />
          ))}
          {failedCount > 0 && (
            <FilterChip type="FAILED" active={filter === 'FAILED'} onClick={() => setFilter('FAILED')}
                        label="분류 실패" count={failedCount} />
          )}
        </div>
      )}

      {reviews === null && !error && <div className="empty-state"><Spinner /> 불러오는 중</div>}
      {reviews && reviews.length === 0 && (
        <div className="empty-state">
          <h2 className="display">{isToday ? '아직 꽂힌 리뷰가 없어요' : '이날은 리뷰가 없어요'}</h2>
          <p>배달앱이나 지도에서 리뷰를 복사해 붙여넣으면 유형별로 나눠드려요.</p>
          <button className="btn primary" onClick={() => go('input')}>리뷰 입력하기</button>
        </div>
      )}
      {list.length > 0 && visible.length === 0 && <div className="empty-state"><p>이 유형의 리뷰가 없어요.</p></div>}

      <div className="rail">
        {visible.map((r) => (
          <Ticket key={r.id} review={r} onUpdated={replace} toast={toast} />
        ))}
      </div>
    </>
  );
}

function FilterChip({ active, onClick, label, count, type }) {
  return (
    <button className={`chip ${type ? `chip-${type}` : ''}`} aria-pressed={active} onClick={onClick}>
      {label}<span className="chip-count">{count}</span>
    </button>
  );
}

function timeOf(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function Ticket({ review: r, onUpdated, toast }) {
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
    <article className={`ticket ${failed ? 'is-failed' : `is-${r.type}`}`}>
      <header className="ticket-head">
        <div className="ticket-meta">
          <span className="stars" role="img" aria-label={`별점 ${r.rating}점`}>{stars(r.rating)}</span>
          <span>{PLATFORM_LABEL[r.platform]}</span>
          <time dateTime={r.createdAt}>{timeOf(r.createdAt)}</time>
        </div>
        <span className={`stamp stamp-${failed ? 'FAILED' : r.type}`}>{failed ? '분류 실패' : TYPE_LABEL[r.type]}</span>
      </header>

      <p className={`review-text ${r.maskedContent ? '' : 'empty'}`}>
        {r.maskedContent ? <Masked text={r.maskedContent} /> : '본문 없이 별점만 남긴 리뷰'}
      </p>

      {!failed && (r.keywords.length > 0 || (r.type !== 'RATING_ONLY' && r.sentiment)) && (
        <ul className="ticket-tags" aria-label="분류 정보">
          {r.keywords.map((k) => <li key={k} className="kw">#{k}</li>)}
          {r.type !== 'RATING_ONLY' && r.sentiment && <li className={`mood mood-${r.sentiment}`}>{SENTIMENT_LABEL[r.sentiment]}</li>}
          {r.type !== 'RATING_ONLY' && r.confidence != null && (
            <li className="confidence">확신도 {Math.round(r.confidence * 100)}%</li>
          )}
        </ul>
      )}

      {failed && (
        <div className="ticket-alert">
          <span>
            {r.failureCode === 'LLM_NOT_CONFIGURED'
              ? 'Claude API 키가 설정되지 않아 분류하지 못했어요. backend/.env 를 확인해주세요.'
              : retryError ?? 'AI 응답을 받지 못해 분류하지 못했어요.'}
          </span>
          <button className="btn small" onClick={retry} disabled={retrying}>
            {retrying && <Spinner />}다시 분류
          </button>
        </div>
      )}

      {r.replies.map((reply) => (
        <TemplateReply key={reply.id} reply={reply} toast={toast}
                       onCopied={(text) => onUpdated({
                         ...r,
                         replies: r.replies.map((p) => (p.id === reply.id ? { ...p, selected: true, editedContent: text } : p)),
                       })} />
      ))}

      {!failed && r.type === 'MALICIOUS' && (
        <p className="ticket-note">바로 답하지 말고 대응 방향부터 정해요. 악성 리뷰 대응 가이드는 다음 업데이트에서 열려요.</p>
      )}
      {!failed && ['PRAISE', 'COMPLAINT', 'INQUIRY'].includes(r.type) && r.replies.length === 0 && (
        <p className="ticket-note">가게 말투로 쓴 답글 초안 3종은 다음 업데이트에서 열려요.</p>
      )}
    </article>
  );
}

function TemplateReply({ reply, toast, onCopied }) {
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
    onCopied(text);
    try {
      await api.selectReply(reply.id, text);
    } catch {
      // 기록 실패는 복사에 영향을 주지 않는다
    }
  }

  return (
    <div className="reply-block">
      <p className="reply-label">답글 초안 <span>별점 템플릿, 확인 후 사용</span></p>
      {editing ? (
        <textarea aria-label="답글 수정" className="reply-edit" value={text} rows={3}
                  onChange={(e) => setText(e.target.value)} />
      ) : (
        <p className="reply">{text}</p>
      )}
      <div className="reply-actions">
        <button className="btn small ghost" onClick={() => setEditing(!editing)}>{editing ? '수정 완료' : '수정'}</button>
        <button className={`btn small ${copied ? 'done' : 'primary'}`} onClick={copy}>
          {copied ? '복사함' : '복사'}
        </button>
      </div>
    </div>
  );
}

/** [전화번호] 같은 가림 표시를 눈에 띄게 */
function Masked({ text }) {
  const parts = text.split(/(\[(?:전화번호|이메일|주소|주문번호|번호)\])/g);
  return parts.map((p, i) => (/^\[.+\]$/.test(p) ? <span key={i} className="mask">{p.slice(1, -1)} 가림</span> : p));
}
