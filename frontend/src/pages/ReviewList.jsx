import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { PLATFORMS, PLATFORM_LABEL, SENTIMENT_LABEL, TYPES, TYPE_LABEL, todayISO } from '../labels.js';
import Icon from '../components/Icon.jsx';
import {
  Alert, DataTable, DataTableHead, DataTableRow, EmptyState, FormInput, FormSelect, IconButton, PageHeader, PrimaryButton,
  SecondaryButton, StatusIndicator, Toolbar,
} from '../components/ui.jsx';
import ReplyDraftPanel from '../components/reply/ReplyDraftPanel.jsx';
import FinalReply from '../components/reply/FinalReply.jsx';
import { DRAFT_TONES, DRAFT_TYPES, finalReplyOf, formatDateTime, statusOf } from '../components/reply/replyModel.js';
import { prefersReducedMotion } from '../components/reply/ReplyTypingText.jsx';

const PAGE_SIZE = 10;
// 작성 완료: 리뷰 원문과 최종 답글 중심 / 작성 대기·분류 실패: 분류 결과와 초안 작업
const DONE_COLUMNS = [
  { label: '번호' },
  { label: '출처' },
  { label: '별점' },
  { label: '리뷰와 최종 답글' },
  { label: '상태' },
];
const WORK_COLUMNS = [
  { label: '번호' },
  { label: '출처' },
  { label: '별점' },
  { label: '리뷰 내용' },
  { label: '분류' },
  { label: '답글 상태' },
  { label: '관리', className: 'rt-actions-head' },
];
const TABS = [
  ['done', '작성 완료'],
  ['wait', '작성 대기'],
  ['fail', '분류 실패'],
];
const TYPE_TONE = { PRAISE: 'praise', COMPLAINT: 'complaint', MALICIOUS: 'malicious', INQUIRY: 'inquiry', RATING_ONLY: 'rating' };

/**
 * 화면 ③ 오늘의 리뷰.
 * 기본 목록(작성 완료)은 사장님이 확정한 최종 답글만 보여준다. 초안 작업은 '작성 대기'에서 한다.
 */
export default function ReviewList({ store, toast, go, initialTab }) {
  const [date, setDate] = useState(todayISO());
  const [filter, setFilter] = useState('ALL'); // 유형
  const [status, setStatus] = useState(TABS.some(([k]) => k === initialTab) ? initialTab : 'done');
  const [platform, setPlatform] = useState('ALL');
  const [page, setPage] = useState(1);
  const [reviews, setReviews] = useState(null);
  const [error, setError] = useState(null);
  const [bulk, setBulk] = useState(null); // 초안 일괄 생성 진행: { done, total }
  const [bulkError, setBulkError] = useState(null);

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
  useEffect(() => setPage(1), [date, filter, platform, status]);

  function changeTab(key) {
    setStatus(key);
    // 새로고침해도 같은 탭이 열리도록 주소에 남긴다
    window.history.replaceState(null, '', key === 'done' ? '#reviews' : `#reviews/${key}`);
  }

  const replace = (updated) => setReviews((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));

  const all = reviews ?? [];
  const list = all.filter((r) => platform === 'ALL' || r.platform === platform);
  // 유형·상태는 서로의 선택을 반영해 개수를 센다. 작성 완료 수에는 확정한 답글만 들어간다 (초안 수와 섞지 않음)
  const byType = list.filter((r) => filter === 'ALL' || r.type === filter);
  const byStatus = list.filter((r) => statusOf(r) === status);
  const typeCounts = byStatus.reduce((m, r) => {
    if (r.type) m[r.type] = (m[r.type] ?? 0) + 1;
    return m;
  }, {});
  const statusCounts = byType.reduce((m, r) => {
    m[statusOf(r)] += 1;
    return m;
  }, { done: 0, wait: 0, fail: 0 });
  const visible = byType.filter((r) => statusOf(r) === status);
  const isToday = date === todayISO();
  const isDone = status === 'done';

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const paged = visible.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const usedPlatforms = PLATFORMS.filter(([v]) => all.some((r) => r.platform === v) || v === platform);

  // 초안이 아직 없는 칭찬·불만·문의 리뷰 (작성 대기 탭의 지금 조건 기준)
  const needDrafts = status === 'wait'
    ? visible.filter((r) => r.status === 'CLASSIFIED' && DRAFT_TYPES.includes(r.type)
      && !r.replies.some((p) => DRAFT_TONES.includes(p.tone)))
    : [];

  // 한 건씩 차례로 생성한다 (동시에 보내면 OpenAI 속도 제한에 걸리기 쉬움). 실패하면 멈추고 이유를 보여준다.
  async function generateAll() {
    if (bulk) return;
    const targets = needDrafts;
    setBulkError(null);
    setBulk({ done: 0, total: targets.length });
    let done = 0;
    for (const r of targets) {
      try {
        replace(await api.generateReplies(r.id));
        done += 1;
        setBulk({ done, total: targets.length });
      } catch (e) {
        setBulkError(`${done}건 생성 후 중단되었습니다: ${e.message} (오류 코드 ${e.code})`);
        break;
      }
    }
    setBulk(null);
    if (done) toast.show(`답글 초안 ${done}건 생성 완료`);
  }

  const typeOptions = [
    ['ALL', `전체 유형 (${byStatus.length})`],
    ...TYPES.map(([key, label]) => [key, `${label} (${typeCounts[key] ?? 0})`]),
  ];

  return (
    <>
      <PageHeader
        title={isToday ? '오늘의 리뷰' : '지난 리뷰'}
        description="작성 완료한 답글을 확인하고, 작성 대기 중인 리뷰의 답글을 확정합니다."
        actions={<PrimaryButton icon="add" onClick={() => go('input')}>리뷰 입력</PrimaryButton>}
      />

      <Toolbar
        className="filters"
        role="group"
        aria-label="리뷰 거르기"
        start={(
          <>
            <FormInput id="reviewDate" label="등록일" hideLabel type="date" icon="calendar" fieldClassName="filter-date"
                       value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)}
                       onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* 지원하지 않는 브라우저는 직접 입력 */ } }} />
            <FormSelect id="platformFilter" label="리뷰 출처" hideLabel value={platform}
                        options={[['ALL', '전체 출처'], ...usedPlatforms]} onChange={(e) => setPlatform(e.target.value)} />
            <FormSelect id="typeFilter" label="유형" hideLabel value={filter} options={typeOptions}
                        onChange={(e) => setFilter(e.target.value)} />
          </>
        )}
      />

      {error && (
        <Alert action={<SecondaryButton tone="neutral" size="sm" icon="retry" onClick={load}>다시 불러오기</SecondaryButton>}>
          {error}
        </Alert>
      )}

      {bulkError && <Alert>{bulkError}</Alert>}

      {reviews === null && !error && <EmptyState loading description="불러오는 중" />}
      {reviews && reviews.length === 0 && (
        <EmptyState
          title={isToday ? '등록된 리뷰 없음' : '해당 날짜의 리뷰 없음'}
          description="리뷰 입력 메뉴에서 리뷰를 등록하면 유형별로 분류됩니다."
          action={<PrimaryButton icon="add" onClick={() => go('input')}>리뷰 등록</PrimaryButton>}
        />
      )}

      {all.length > 0 && (
        <DataTable label="리뷰 목록" className={`review-table ${isDone ? 'is-done-view' : ''}`}>
          <div className="dt-caption">
            <div className="status-tabs" role="group" aria-label="답글 상태로 거르기">
              {TABS.map(([key, label]) => (
                <button key={key} type="button" aria-pressed={status === key} className={`status-tab is-${key}`}
                        onClick={() => changeTab(key)}>
                  {label}
                  <span className="status-count">{statusCounts[key]}</span>
                </button>
              ))}
            </div>
            {(needDrafts.length > 0 || bulk) && (
              <SecondaryButton size="sm" icon="analyze" onClick={generateAll} loading={!!bulk}
                               loadingText={bulk ? `초안 생성 중 ${bulk.done}/${bulk.total}` : '생성 중'}>
                초안 일괄 생성 ({needDrafts.length})
              </SecondaryButton>
            )}
            {visible.length > 0 && (
              <span className="page-range">
                {visible.length}건 중 {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, visible.length)}
              </span>
            )}
          </div>
          {visible.length === 0 ? (
            <EmptyTab status={status} waitCount={statusCounts.wait} onShowWait={() => changeTab('wait')} />
          ) : (
            <>
              <DataTableHead columns={isDone ? DONE_COLUMNS : WORK_COLUMNS} />
              {paged.map((r, i) => {
                const no = (current - 1) * PAGE_SIZE + i + 1;
                return isDone
                  ? <CompletedRow key={r.id} no={no} review={r} onUpdated={replace} toast={toast} />
                  : <Ticket key={r.id} no={no} review={r} onUpdated={replace} toast={toast} />;
              })}
            </>
          )}
        </DataTable>
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

function EmptyTab({ status, waitCount, onShowWait }) {
  if (status === 'done') {
    return (
      <div className="dt-empty">
        <p>작성 완료한 답글이 없습니다.</p>
        {waitCount > 0 && (
          <p className="dt-empty-sub">
            작성 대기 {waitCount}건에서 초안을 고르고 작성 완료를 누르면 여기에 표시됩니다.
            {' '}<button type="button" className="text-btn" onClick={onShowWait}>작성 대기 보기</button>
          </p>
        )}
      </div>
    );
  }
  return <p className="dt-empty">{status === 'wait' ? '작성 대기 중인 리뷰가 없습니다.' : '분류에 실패한 리뷰가 없습니다.'}</p>;
}

/** 작성 완료 행: 리뷰 원문 → 최종 답글. 초안은 보여주지 않는다. */
function CompletedRow({ no, review: r, onUpdated, toast }) {
  const reply = finalReplyOf(r);
  // 완료한 뒤 다른 시각(분 단위)에 고쳤을 때만 수정 시각을 따로 보여준다
  const edited = r.finalUpdatedAt && r.completedAt && formatDateTime(r.finalUpdatedAt) !== formatDateTime(r.completedAt);

  async function save(text) {
    try {
      onUpdated(await api.completeReply(r.id, reply.id, text));
      toast.show('최종 답글을 저장했습니다.');
      return true;
    } catch (e) {
      toast.show(`저장하지 못했습니다: ${e.message}`);
      return false;
    }
  }

  return (
    <DataTableRow className="rt-item is-done">
      <span className="rt-no" role="cell">{no}</span>
      <span className="rt-platform" role="cell"><span className="platform">{PLATFORM_LABEL[r.platform]}</span></span>
      <span className="rt-rating" role="cell">
        <span className="rating" aria-label={`별점 ${r.rating}점`}><Icon name="star" size={16} />{r.rating}</span>
      </span>
      <div className="rt-content" role="cell">
        <p className={`review-text ${r.maskedContent ? '' : 'is-empty'}`}>
          {r.maskedContent ? <Masked text={r.maskedContent} /> : '(본문 없음, 별점만 등록)'}
        </p>
        <p className="meta">
          <span>{TYPE_LABEL[r.type]}</span>
          {r.writtenAt && <span>작성일 {r.writtenAt}</span>}
        </p>
        {reply && <FinalReply reply={reply} onSave={save} toast={toast} />}
      </div>
      <div className="rt-done" role="cell">
        <span className="done-mark"><Icon name="confirm" size={16} />작성 완료</span>
        <time dateTime={r.completedAt} title={edited ? `마지막 수정 ${formatDateTime(r.finalUpdatedAt)}` : undefined}>
          {formatDateTime(r.completedAt)}
        </time>
        {edited && <span className="done-sub">수정 {formatDateTime(r.finalUpdatedAt)}</span>}
      </div>
    </DataTableRow>
  );
}

/** 작성 대기·분류 실패 행: 분류 결과와 답글 초안 작업 */
function Ticket({ no, review: r, onUpdated, toast }) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState(null);
  const [generation, setGeneration] = useState({ state: 'idle' });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true; // 개발 모드(StrictMode)는 마운트를 두 번 하므로 다시 켠다
    return () => { mounted.current = false; };
  }, []);
  const failed = r.status === 'FAILED';

  async function retry() {
    setRetrying(true);
    setRetryError(null);
    try {
      onUpdated(await api.reclassify(r.id));
      toast.show('재분류 완료');
    } catch (e) {
      setRetryError({ code: e.code, message: e.message });
    } finally {
      setRetrying(false);
    }
  }

  async function generate() {
    if (generation.state === 'loading') return; // 중복 요청 방지
    const before = new Set(r.replies.map((p) => p.id));
    setGeneration({ state: 'loading' });
    try {
      const updated = await api.generateReplies(r.id);
      if (!mounted.current) return; // 페이지를 떠났으면 상태를 바꾸지 않는다
      const fresh = updated.replies.filter((p) => !before.has(p.id) && DRAFT_TONES.includes(p.tone)).map((p) => p.id);
      onUpdated(updated);
      setGeneration({ state: 'idle', freshIds: prefersReducedMotion() ? [] : fresh });
    } catch (e) {
      if (mounted.current) setGeneration({ state: 'error', error: { code: e.code, message: e.message } });
    }
  }

  async function complete(replyId, text) {
    try {
      onUpdated(await api.completeReply(r.id, replyId, text));
      toast.show('작성 완료로 저장했습니다. 작성 완료 탭에서 확인할 수 있습니다.');
      return true;
    } catch (e) {
      toast.show(`저장하지 못했습니다: ${e.message}`);
      return false;
    }
  }

  const hasReplyArea = !failed && (r.replies.length > 0 || DRAFT_TYPES.includes(r.type));

  return (
    <DataTableRow className={`rt-item ${failed ? 'is-failed' : ''}`}>
      <span className="rt-no" role="cell">{no}</span>
      <span className="rt-platform" role="cell"><span className="platform">{PLATFORM_LABEL[r.platform]}</span></span>
      <span className="rt-rating" role="cell">
        <span className="rating" aria-label={`별점 ${r.rating}점`}><Icon name="star" size={16} />{r.rating}</span>
      </span>

      <div className="rt-content" role="cell">
        <p className={`review-text ${r.maskedContent ? '' : 'is-empty'}`}>
          {r.maskedContent ? <Masked text={r.maskedContent} /> : '(본문 없음, 별점만 등록)'}
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
        <ReplyStatus review={r} generation={generation} />
      </span>

      {failed && (
        <div className="rt-actions" role="cell">
          <IconButton icon={retrying ? 'loading' : 'retry'} className={retrying ? 'is-loading' : undefined}
                      label="재분류" onClick={retry} disabled={retrying} />
        </div>
      )}
      {failed && (
        <p className="rt-error">
          {retryError ? retryError.message : failureText(r.failureCode)}
          <span className="error-code">오류 코드 {retryError?.code ?? r.failureCode ?? 'LLM_FAILED'}</span>
        </p>
      )}

      {hasReplyArea && (
        <ReplyDraftPanel review={r} generation={generation} onGenerate={generate} onComplete={complete} toast={toast} />
      )}

      {!failed && r.type === 'MALICIOUS' && (
        <p className="rt-reply hint">악성 리뷰: 즉시 답글보다 대응 방향 검토를 권장합니다. (대응 가이드 준비 중)</p>
      )}
    </DataTableRow>
  );
}

/** 작성 대기 행의 답글 상태: 생성 중 / 생성 실패 / 초안 n개 / 초안 없음 */
function ReplyStatus({ review: r, generation }) {
  if (r.status === 'FAILED') return <StatusIndicator tone="danger" icon="error">분류 실패</StatusIndicator>;
  if (generation.state === 'loading') return <StatusIndicator tone="inquiry" icon="loading">생성 중</StatusIndicator>;
  if (generation.state === 'error') return <StatusIndicator tone="danger" icon="error">생성 실패</StatusIndicator>;
  const drafts = r.replies.filter((p) => p.id !== r.finalReplyId).length;
  return <StatusIndicator tone="neutral">{drafts ? `초안 ${drafts}개` : '초안 없음'}</StatusIndicator>;
}

const FAILURE_TEXT = {
  LLM_NOT_CONFIGURED: 'OpenAI API 키가 설정되지 않았습니다. backend/.env의 OPENAI_API_KEY를 확인하십시오.',
  LLM_TRUNCATED: 'AI 응답이 길이 한도에서 잘렸습니다.',
  LLM_TIMEOUT: 'AI 응답 시간이 초과되었습니다.',
  LLM_REFUSED: 'AI가 이 리뷰의 분석을 거절했습니다.',
  LLM_INVALID: 'AI 응답 형식이 올바르지 않습니다.',
  LLM_HTTP_400: 'OpenAI가 요청을 거부했습니다 (HTTP 400). 서버 로그를 확인하십시오.',
  LLM_HTTP_401: 'OpenAI API 키가 유효하지 않습니다. backend/.env를 확인하십시오.',
  LLM_HTTP_403: 'OpenAI API 키에 권한이 없습니다. backend/.env를 확인하십시오.',
  LLM_HTTP_429: 'OpenAI 사용 한도를 초과했거나 요청이 많습니다. 결제·사용 한도를 확인하십시오.',
  LLM_QUOTA: 'OpenAI 크레딧 또는 사용 한도가 소진되었습니다. platform.openai.com의 Billing과 Limits를 확인하십시오.',
  LLM_RATE_LIMIT: 'OpenAI 요청 속도 제한에 걸렸습니다. 1분 정도 뒤에 다시 시도하십시오.',
};

/** 실패 코드 → 안내 문구. 다시 시도해 해결될 수 있는 실패에는 재분류 안내를 붙인다. */
function failureText(code) {
  const text = FAILURE_TEXT[code] ?? (code?.startsWith('LLM_HTTP_5') ? 'OpenAI 서버 오류입니다.' : 'AI 응답을 받지 못했습니다.');
  const retryable = !['LLM_NOT_CONFIGURED', 'LLM_HTTP_401', 'LLM_HTTP_403', 'LLM_REFUSED', 'LLM_QUOTA'].includes(code);
  return retryable ? `${text} 재분류 버튼으로 다시 시도할 수 있습니다.` : text;
}

function timeOf(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}


/** [전화번호] 같은 가림 표시를 눈에 띄게 */
function Masked({ text }) {
  const parts = text.split(/(\[(?:전화번호|이메일|주소|주문번호|번호)\])/g);
  return parts.map((p, i) => (/^\[.+\]$/.test(p) ? <span key={i} className="mask">{p.slice(1, -1)} 마스킹</span> : p));
}
