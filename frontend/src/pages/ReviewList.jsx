import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { PLATFORMS, PLATFORM_LABEL, SENTIMENT_LABEL, TYPES, TYPE_LABEL, todayISO } from '../labels.js';
import Icon from '../components/Icon.jsx';
import {
  Alert, EmptyState, FormInput, FormSelect, IconButton, PageHeader, PrimaryButton, SecondaryButton, StatusIndicator,
} from '../components/ui.jsx';

const PAGE_SIZE = 10;
const TYPE_TONE = { PRAISE: 'praise', COMPLAINT: 'complaint', MALICIOUS: 'malicious', INQUIRY: 'inquiry', RATING_ONLY: 'rating' };

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

  const typeOptions = [
    ['ALL', `전체 유형 (${list.length})`],
    ...TYPES.map(([key, label]) => [key, `${label} (${counts[key] ?? 0})`]),
    ...(failedCount > 0 || filter === 'FAILED' ? [['FAILED', `분류 실패 (${failedCount})`]] : []),
  ];

  return (
    <>
      <PageHeader
        title={isToday ? '오늘의 리뷰' : '지난 리뷰'}
        description="등록된 리뷰의 분류 결과와 답글 초안을 확인합니다."
        actions={<PrimaryButton icon="add" onClick={() => go('input')}>리뷰 입력</PrimaryButton>}
      />

      <div className="filters" role="group" aria-label="리뷰 거르기">
        <FormInput id="reviewDate" label="날짜" hideLabel type="date" icon="calendar" fieldClassName="filter-date"
                   value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)}
                   onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* 지원하지 않는 브라우저는 직접 입력 */ } }} />
        <FormSelect id="platformFilter" label="리뷰 출처" hideLabel value={platform}
                    options={[['ALL', '전체 출처'], ...usedPlatforms]} onChange={(e) => setPlatform(e.target.value)} />
        <FormSelect id="typeFilter" label="유형" hideLabel value={filter} options={typeOptions}
                    onChange={(e) => setFilter(e.target.value)} />
      </div>

      {error && (
        <Alert action={<SecondaryButton tone="neutral" size="sm" icon="retry" onClick={load}>다시 불러오기</SecondaryButton>}>
          {error}
        </Alert>
      )}

      {reviews && reviews.length > 0 && (
        <dl className="summary" aria-label="요약">
          <div><dt>전체 리뷰</dt><dd>{list.length}<small>개</small></dd></div>
          <div><dt>답글 완료</dt><dd>{done}<small>개</small></dd></div>
          <div><dt>답글 대기</dt><dd>{list.length - done}<small>개</small></dd></div>
          <div><dt>분류 실패</dt><dd>{failedCount}<small>개</small></dd></div>
        </dl>
      )}

      {reviews === null && !error && <EmptyState loading description="불러오는 중" />}
      {reviews && reviews.length === 0 && (
        <EmptyState
          title={isToday ? '등록된 리뷰 없음' : '해당 날짜의 리뷰 없음'}
          description="리뷰 입력 메뉴에서 리뷰를 등록하면 유형별로 분류됩니다."
          action={<PrimaryButton icon="add" onClick={() => go('input')}>리뷰 등록</PrimaryButton>}
        />
      )}
      {all.length > 0 && visible.length === 0 && <EmptyState description="조건에 맞는 리뷰가 없습니다." />}

      {visible.length > 0 && (
        <div className="review-table" role="table" aria-label="리뷰 목록">
          <div className="rt-row rt-head" role="row">
            <span role="columnheader">번호</span>
            <span role="columnheader">출처</span>
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
        <nav className="pagination" aria-label="페이지 이동">
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

function ReplyStatus({ review: r }) {
  if (r.status === 'FAILED') return <StatusIndicator tone="danger" icon="error">분류 실패</StatusIndicator>;
  if (r.replies.some((p) => p.selected)) return <StatusIndicator tone="success" icon="confirm">답글 완료</StatusIndicator>;
  return <StatusIndicator tone="neutral">답글 대기</StatusIndicator>;
}

/** 리뷰 한 건 = 표의 한 행. 답글 초안은 행 아래에 회색 영역으로 붙는다. */
function Ticket({ no, review: r, onUpdated, toast }) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState(null);
  const failed = r.status === 'FAILED';

  async function retry() {
    setRetrying(true);
    setRetryError(null);
    try {
      onUpdated(await api.reclassify(r.id));
      toast.show('재분류 완료');
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
          {r.maskedContent ? <Masked text={r.maskedContent} /> : '(본문 없음 · 별점만 등록)'}
        </p>
        <p className="meta">
          <time dateTime={r.createdAt} title="등록 시각">{timeOf(r.createdAt)}</time>
          {r.writtenAt && <span>작성일 {r.writtenAt}</span>}
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
        {failed
          ? <StatusIndicator tone="danger">미분류</StatusIndicator>
          : <StatusIndicator tone={TYPE_TONE[r.type]}>{TYPE_LABEL[r.type]}</StatusIndicator>}
      </span>
      <span className="rt-status" role="cell">
        <ReplyStatus review={r} />
      </span>

      {failed && (
        <div className="rt-actions" role="cell">
          <IconButton icon={retrying ? 'loading' : 'retry'} className={retrying ? 'is-loading' : undefined}
                      label="재분류" onClick={retry} disabled={retrying} />
        </div>
      )}
      {failed && (
        <p className="rt-error">
          {r.failureCode === 'LLM_NOT_CONFIGURED'
            ? 'OpenAI API 키 미설정. backend/.env의 OPENAI_API_KEY를 확인하십시오.'
            : retryError ?? 'AI 응답 수신 실패. 재분류 버튼으로 다시 시도할 수 있습니다.'}
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
        <p className="rt-reply hint">악성 리뷰: 즉시 답글보다 대응 방향 검토를 권장합니다. (대응 가이드 준비 중)</p>
      )}
      {!failed && ['PRAISE', 'COMPLAINT', 'INQUIRY'].includes(r.type) && r.replies.length === 0 && (
        <p className="rt-reply hint">맞춤 답글 초안 생성 기능 준비 중</p>
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
      toast.show('복사 완료');
    } catch {
      toast.show('클립보드 접근이 차단되었습니다. 답글을 직접 선택해 복사하십시오.');
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
        <IconButton icon={editing ? 'confirm' : 'edit'} label={editing ? '수정 완료' : '답글 수정'}
                    aria-pressed={editing} onClick={() => setEditing(!editing)} />
        <IconButton icon={copied ? 'confirm' : 'copy'} tone={copied ? 'success' : undefined}
                    label={copied ? '복사 완료 · 다시 복사' : '답글 복사'} onClick={copy} />
      </div>
      <div className="rt-reply">
        <span className="ai-label">AI 답글 초안 · 별점 템플릿 (게시 전 확인 필요)</span>
        {editing ? (
          <div className="rt-edit">
            <FormInput multiline aria-label="답글 수정" value={text} rows={3} onChange={(e) => setText(e.target.value)} />
            <div className="end">
              <SecondaryButton tone="neutral" size="sm" onClick={() => setEditing(false)}>수정 완료</SecondaryButton>
              <PrimaryButton size="sm" icon="copy" onClick={copy}>복사</PrimaryButton>
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
  return parts.map((p, i) => (/^\[.+\]$/.test(p) ? <span key={i} className="mask">{p.slice(1, -1)} 마스킹</span> : p));
}
