import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { PLATFORMS, PLATFORM_LABEL, SENTIMENT_LABEL, TYPES, TYPE_LABEL, todayISO } from '../labels.js';
import Spinner from '../components/Spinner.jsx';
import Icon from '../components/Icon.jsx';

const PAGE_SIZE = 10;

/** 화면 ③ 오늘의 리뷰: 날짜별 리뷰를 표로 보고, 분류 결과와 답글 초안을 확인·복사한다. */
export default function ReviewList({ store, toast, go }) {
  const [date, setDate] = useState(todayISO());
  const [filter, setFilter] = useState('ALL');
  const [platform, setPlatform] = useState('ALL');
  const [page, setPage] = useState(1);
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

  // 거르는 조건이 바뀌면 첫 페이지로
  useEffect(() => setPage(1), [date, filter, platform]);

  const replace = (updated) => setReviews((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));

  const all = reviews ?? [];
  const list = all.filter((r) => platform === 'ALL' || r.platform === platform);
  const counts = list.reduce((m, r) => {
    if (r.type) m[r.type] = (m[r.type] ?? 0) + 1;
    return m;
  }, {});
  const failedCount = list.filter((r) => r.status === 'FAILED').length;
  const done = list.filter((r) => r.replies.some((p) => p.selected)).length;
  const visible = list.filter((r) =>
    filter === 'ALL' ? true : filter === 'FAILED' ? r.status === 'FAILED' : r.type === filter);
  const isToday = date === todayISO();

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const paged = visible.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const usedPlatforms = PLATFORMS.filter(([v]) => all.some((r) => r.platform === v) || v === platform);

  return (
    <>
      <div className="page-head">
        <div className="page-title">
          <h1>{isToday ? '오늘의 리뷰' : '지난 리뷰'}</h1>
          <p>리뷰를 유형별로 나누고 답글 초안을 준비했어요. 확인한 뒤 복사해서 배달앱에 붙여 넣어 주세요.</p>
        </div>
        <button className="btn btn-primary" onClick={() => go('input')}>
          <Icon name="add" />
          리뷰 입력
        </button>
      </div>

      <div className="filters">
        <label className="date-input">
          <span className="sr-only">날짜</span>
          <Icon name="calendar" />
          <input type="date" className="input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)}
                 onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* 지원하지 않는 브라우저는 직접 입력 */ } }} />
        </label>
        <div className="field">
          <label className="sr-only" htmlFor="platformFilter">플랫폼</label>
          <select id="platformFilter" className="select" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="ALL">전체 플랫폼</option>
            {usedPlatforms.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="sr-only" htmlFor="typeFilter">유형</label>
          <select id="typeFilter" className="select" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="ALL">전체 유형 ({list.length})</option>
            {TYPES.map(([key, label]) => (
              <option key={key} value={key}>{label} ({counts[key] ?? 0})</option>
            ))}
            {(failedCount > 0 || filter === 'FAILED') && <option value="FAILED">분류 실패 ({failedCount})</option>}
          </select>
        </div>
      </div>

      {error && (
        <div className="alert" role="alert">
          <Icon name="error" />
          <span>{error}</span>
          <button className="btn btn-sm" onClick={load}>
            <Icon name="retry" />
            다시 불러오기
          </button>
        </div>
      )}

      {reviews && reviews.length > 0 && (
        <dl className="summary" aria-label="요약">
          <div><dt>전체 리뷰</dt><dd>{list.length}<small>개</small></dd></div>
          <div><dt>답글 완료</dt><dd>{done}<small>개</small></dd></div>
          <div><dt>답글 대기</dt><dd>{list.length - done}<small>개</small></dd></div>
          <div><dt>분류 실패</dt><dd>{failedCount}<small>개</small></dd></div>
        </dl>
      )}

      {reviews === null && !error && (
        <div className="section empty"><Spinner /><p>불러오는 중</p></div>
      )}
      {reviews && reviews.length === 0 && (
        <div className="section empty">
          <h2>{isToday ? '아직 입력한 리뷰가 없어요' : '이날은 리뷰가 없어요'}</h2>
          <p>배달앱이나 지도에서 리뷰를 복사해 붙여 넣으면 유형별로 나눠 드려요.</p>
          <button className="btn btn-primary" onClick={() => go('input')}>
            <Icon name="add" />
            리뷰 입력하기
          </button>
        </div>
      )}
      {all.length > 0 && visible.length === 0 && (
        <div className="section empty"><p>조건에 맞는 리뷰가 없어요.</p></div>
      )}

      {visible.length > 0 && (
        <div className="review-table" role="table" aria-label="리뷰 목록">
          <div className="rt-row rt-head" role="row">
            <span role="columnheader">번호</span>
            <span role="columnheader">플랫폼</span>
            <span role="columnheader">별점</span>
            <span role="columnheader">리뷰 내용</span>
            <span role="columnheader">분류</span>
            <span role="columnheader">답글 상태</span>
            <span role="columnheader" className="rt-actions-head">관리</span>
          </div>
          {paged.map((r, i) => (
            <Ticket key={r.id} no={(current - 1) * PAGE_SIZE + i + 1} review={r} onUpdated={replace} toast={toast} />
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <nav className="pagination" aria-label="페이지">
          <button aria-label="이전 페이지" disabled={current === 1} onClick={() => setPage(current - 1)}>
            <Icon name="prev" />
          </button>
          {Array.from({ length: pageCount }, (_, n) => n + 1).map((n) => (
            <button key={n} aria-current={n === current ? 'page' : undefined} onClick={() => setPage(n)}>{n}</button>
          ))}
          <button aria-label="다음 페이지" disabled={current === pageCount} onClick={() => setPage(current + 1)}>
            <Icon name="next" />
          </button>
        </nav>
      )}
    </>
  );
}

function timeOf(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function replyStatus(r) {
  if (r.status === 'FAILED') return ['fail', '분류 실패'];
  if (r.replies.some((p) => p.selected)) return ['done', '답글 완료'];
  return ['wait', '답글 대기'];
}

/** 리뷰 한 건 = 표의 한 행. 답글 초안은 행 아래에 회색 영역으로 붙는다. */
function Ticket({ no, review: r, onUpdated, toast }) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState(null);
  const failed = r.status === 'FAILED';
  const [statusKey, statusLabel] = replyStatus(r);

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
    <div className={`rt-row rt-item ${failed ? 'is-failed' : ''}`} role="row">
      <span className="rt-no" role="cell">{no}</span>
      <span className="rt-platform" role="cell"><span className="platform">{PLATFORM_LABEL[r.platform]}</span></span>
      <span className="rt-rating" role="cell">
        <span className="rating" aria-label={`별점 ${r.rating}점`}><Icon name="star" size={16} />{r.rating}</span>
      </span>

      <div className="rt-content" role="cell">
        <p className={`review-text ${r.maskedContent ? '' : 'is-empty'}`}>
          {r.maskedContent ? <Masked text={r.maskedContent} /> : '본문 없이 별점만 남긴 리뷰'}
        </p>
        <p className="meta">
          <time dateTime={r.createdAt}>{timeOf(r.createdAt)}</time>
          {!failed && r.keywords.length > 0 && (
            <span className="kw">{r.keywords.map((k) => `#${k}`).join(' ')}</span>
          )}
          {!failed && r.type !== 'RATING_ONLY' && r.sentiment && <span>{SENTIMENT_LABEL[r.sentiment]}</span>}
          {!failed && r.type !== 'RATING_ONLY' && r.confidence != null && (
            <span>확신도 {Math.round(r.confidence * 100)}%</span>
          )}
        </p>
      </div>

      <span className="rt-type" role="cell">
        <span className="cell-label">분류</span>
        <span className={`type type-${failed ? 'FAILED' : r.type}`}>{failed ? '실패' : TYPE_LABEL[r.type]}</span>
      </span>
      <span className="rt-status" role="cell">
        <span className={`status status-${statusKey}`}>{statusLabel}</span>
      </span>

      {failed && (
        <div className="rt-actions" role="cell">
          <button className="icon-btn" onClick={retry} disabled={retrying} aria-label="다시 분류" title="다시 분류">
            {retrying ? <Spinner /> : <Icon name="retry" />}
          </button>
        </div>
      )}
      {failed && (
        <p className="rt-error">
          {r.failureCode === 'LLM_NOT_CONFIGURED'
            ? 'OpenAI API 키가 설정되지 않아 분류하지 못했어요. backend/.env 의 OPENAI_API_KEY 를 확인해 주세요.'
            : retryError ?? 'AI 응답을 받지 못해 분류하지 못했어요. 오른쪽 버튼으로 다시 분류해 주세요.'}
        </p>
      )}

      {r.replies.map((reply) => (
        <TemplateReply key={reply.id} reply={reply} toast={toast}
                       onCopied={(text) => onUpdated({
                         ...r,
                         replies: r.replies.map((p) => (p.id === reply.id ? { ...p, selected: true, editedContent: text } : p)),
                       })} />
      ))}

      {!failed && r.type === 'MALICIOUS' && (
        <p className="rt-reply hint">바로 답하지 말고 대응 방향부터 정해요. 악성 리뷰 대응 가이드는 다음 업데이트에서 열려요.</p>
      )}
      {!failed && ['PRAISE', 'COMPLAINT', 'INQUIRY'].includes(r.type) && r.replies.length === 0 && (
        <p className="rt-reply hint">가게 말투로 쓴 답글 초안 3종은 다음 업데이트에서 열려요.</p>
      )}
    </div>
  );
}

/**
 * 답글 초안: 복사·수정 버튼은 행의 '관리' 칸에, 본문은 행 아래 AI 답글 영역에 놓는다.
 * (지금은 리뷰당 초안이 최대 1개 — 3종 초안이 들어오면 이 배치를 다시 정한다)
 */
function TemplateReply({ reply, toast, onCopied }) {
  const [text, setText] = useState(reply.editedContent ?? reply.content);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(reply.selected);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.show('답글을 복사했어요');
    } catch {
      toast.show('복사가 막혀 있어요. 답글을 직접 선택해 복사해 주세요');
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
    <>
      <div className="rt-actions" role="cell">
        <button className="icon-btn" onClick={() => setEditing(!editing)} aria-pressed={editing}
                aria-label={editing ? '답글 수정 완료' : '답글 수정'} title={editing ? '수정 완료' : '수정'}>
          <Icon name={editing ? 'confirm' : 'edit'} />
        </button>
        <button className={`icon-btn ${copied ? 'is-done' : ''}`} onClick={copy}
                aria-label={copied ? '답글 다시 복사' : '답글 복사'} title={copied ? '복사함 · 다시 복사' : '복사'}>
          <Icon name={copied ? 'confirm' : 'copy'} />
        </button>
      </div>
      <div className="rt-reply">
        <span className="ai-label">AI 답글 초안 · 별점 템플릿, 확인 후 사용</span>
        {editing ? (
          <div className="rt-edit">
            <textarea aria-label="답글 수정" className="textarea" value={text} rows={3}
                      onChange={(e) => setText(e.target.value)} />
            <div className="end">
              <button className="btn btn-sm" onClick={() => setEditing(false)}>수정 완료</button>
              <button className="btn btn-sm btn-primary" onClick={copy}>
                <Icon name="copy" size={16} />
                복사
              </button>
            </div>
          </div>
        ) : (
          <p className="ai-text">{text}</p>
        )}
      </div>
    </>
  );
}

/** [전화번호] 같은 가림 표시를 눈에 띄게 */
function Masked({ text }) {
  const parts = text.split(/(\[(?:전화번호|이메일|주소|주문번호|번호)\])/g);
  return parts.map((p, i) => (/^\[.+\]$/.test(p) ? <span key={i} className="mask">{p.slice(1, -1)} 가림</span> : p));
}
