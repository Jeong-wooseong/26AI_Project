import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { PLATFORMS, PLATFORM_LABEL, SENTIMENT_LABEL, TYPES, TYPE_LABEL, todayISO } from '../labels.js';
import Icon from '../components/Icon.jsx';
import {
  Alert, DataTable, DataTableHead, DataTableRow, EmptyState, FormInput, FormSelect, IconButton, PageHeader, PrimaryButton,
  SecondaryButton, StatusIndicator, Toolbar,
} from '../components/ui.jsx';

const PAGE_SIZE = 10;
const COLUMNS = [
  { label: '번호' },
  { label: '출처' },
  { label: '별점' },
  { label: '리뷰 내용' },
  { label: '분류' },
  { label: '답글 상태' },
  { label: '관리', className: 'rt-actions-head' },
];
const TYPE_TONE = { PRAISE: 'praise', COMPLAINT: 'complaint', MALICIOUS: 'malicious', INQUIRY: 'inquiry', RATING_ONLY: 'rating' };

/** 화면 ③ 오늘의 리뷰: 날짜별 리뷰를 표로 보고, 분류 결과와 답글 초안을 확인·복사한다. */
export default function ReviewList({ store, toast, go }) {
  const [date, setDate] = useState(todayISO());
  const [filter, setFilter] = useState('ALL'); // 유형
  const [status, setStatus] = useState('ALL'); // 답글 상태: ALL | done | wait | fail
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

  const replace = (updated) => setReviews((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));

  const all = reviews ?? [];
  const list = all.filter((r) => platform === 'ALL' || r.platform === platform);
  // 유형·답글 상태는 서로의 선택을 반영해 개수를 센다 (선택한 조건 안에서 몇 건인지)
  const byType = list.filter((r) => filter === 'ALL' || r.type === filter);
  const byStatus = list.filter((r) => status === 'ALL' || statusOf(r) === status);
  const typeCounts = byStatus.reduce((m, r) => {
    if (r.type) m[r.type] = (m[r.type] ?? 0) + 1;
    return m;
  }, {});
  const statusCounts = byType.reduce((m, r) => {
    m[statusOf(r)] += 1;
    return m;
  }, { done: 0, wait: 0, fail: 0 });
  const visible = byType.filter((r) => status === 'ALL' || statusOf(r) === status);
  const isToday = date === todayISO();

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const paged = visible.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const usedPlatforms = PLATFORMS.filter(([v]) => all.some((r) => r.platform === v) || v === platform);

  // 초안이 아직 없는 칭찬·불만·문의 리뷰 (지금 보이는 조건 기준)
  const needDrafts = visible.filter((r) => r.status === 'CLASSIFIED' && DRAFT_TYPES.includes(r.type)
    && !r.replies.some((p) => p.tone !== 'TEMPLATE'));

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
  const statusTabs = [
    ['ALL', '전체', byType.length],
    ['done', '답글 완료', statusCounts.done],
    ['wait', '답글 대기', statusCounts.wait],
    ['fail', '분류 실패', statusCounts.fail],
  ];

  return (
    <>
      <PageHeader
        title={isToday ? '오늘의 리뷰' : '지난 리뷰'}
        description="등록된 리뷰의 분류 결과와 답글 초안을 확인합니다."
        actions={<PrimaryButton icon="add" onClick={() => go('input')}>리뷰 입력</PrimaryButton>}
      />

      <Toolbar
        className="filters"
        role="group"
        aria-label="리뷰 거르기"
        start={(
          <>
            <FormInput id="reviewDate" label="날짜" hideLabel type="date" icon="calendar" fieldClassName="filter-date"
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
        <DataTable label="리뷰 목록" className="review-table">
          <div className="dt-caption">
            <div className="status-tabs" role="group" aria-label="답글 상태로 거르기">
              {statusTabs.map(([key, label, count]) => (
                <button key={key} type="button" aria-pressed={status === key} className={`status-tab is-${key}`}
                        onClick={() => setStatus(key)}>
                  {label}
                  <span className="status-count">{count}</span>
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
            <p className="dt-empty">조건에 맞는 리뷰가 없습니다.</p>
          ) : (
            <>
              <DataTableHead columns={COLUMNS} />
              {paged.map((r, i) => (
                <Ticket key={r.id} no={(current - 1) * PAGE_SIZE + i + 1} review={r} onUpdated={replace} toast={toast} />
              ))}
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

/** 답글 상태 (서로 겹치지 않음): 분류 실패 → 답글 완료(복사함) → 답글 대기 */
function statusOf(r) {
  if (r.status === 'FAILED') return 'fail';
  if (r.replies.some((p) => p.selected)) return 'done';
  return 'wait';
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
      setRetryError({ code: e.code, message: e.message });
    } finally {
      setRetrying(false);
    }
  }

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
          {retryError ? retryError.message : failureText(r.failureCode)}
          <span className="error-code">오류 코드 {retryError?.code ?? r.failureCode ?? 'LLM_FAILED'}</span>
        </p>
      )}

      {!failed && (r.replies.length > 0 || DRAFT_TYPES.includes(r.type)) && (
        <ReplyDrafts review={r} onUpdated={onUpdated} toast={toast} />
      )}

      {!failed && r.type === 'MALICIOUS' && (
        <p className="rt-reply hint">악성 리뷰: 즉시 답글보다 대응 방향 검토를 권장합니다. (대응 가이드 준비 중)</p>
      )}
    </DataTableRow>
  );
}

const DRAFT_TYPES = ['PRAISE', 'COMPLAINT', 'INQUIRY'];
const TONE_LABEL = { POLITE: '정중형', FRIENDLY: '친근형', CONCISE: '간결형', TEMPLATE: '별점 템플릿' };
const FILL_IN = /(\[[^\]\n]{1,30}\])/g;

/**
 * 행 아래 AI 답글 영역: 칭찬·불만·문의는 초안 3종(정중형·친근형·간결형), 별점만 리뷰는 템플릿 답글 1개.
 * 초안이 없으면 생성 버튼, 있으면 다시 생성(복사한 초안은 이력으로 남음).
 */
function ReplyDrafts({ review: r, onUpdated, toast }) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const canGenerate = DRAFT_TYPES.includes(r.type) && r.status !== 'FAILED';
  const drafts = r.replies.filter((p) => p.tone !== 'TEMPLATE');

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      onUpdated(await api.generateReplies(r.id));
      toast.show('답글 초안 생성 완료');
    } catch (e) {
      setError({ code: e.code, message: e.message });
    } finally {
      setGenerating(false);
    }
  }

  const markCopied = (reply, text) => onUpdated({
    ...r,
    replies: r.replies.map((p) => (p.id === reply.id ? { ...p, selected: true, editedContent: text } : p)),
  });

  return (
    <div className="rt-reply">
      <div className="reply-head">
        <span className="ai-label">
          AI 답글 초안
          <small>{drafts.length ? '정중형·친근형·간결형' : r.type === 'RATING_ONLY' ? '별점 템플릿 기반' : '매장 답글 스타일 반영'}, 게시 전 확인 필요</small>
        </span>
        {canGenerate && drafts.length > 0 && (
          <button type="button" className="text-btn" onClick={generate} disabled={generating}>
            {generating ? '생성 중…' : '다시 생성'}
          </button>
        )}
      </div>

      {r.replies.map((reply) => (
        <TemplateReply key={reply.id} reply={reply} label={TONE_LABEL[reply.tone] ?? reply.tone} toast={toast}
                       onCopied={(text) => markCopied(reply, text)} />
      ))}

      {canGenerate && drafts.length === 0 && (
        <div className="reply-empty">
          <SecondaryButton size="sm" icon="analyze" onClick={generate} loading={generating} loadingText="생성 중">
            답글 초안 3개 생성
          </SecondaryButton>
          <span className="hint">매장 답글 스타일과 리뷰 키워드를 반영합니다.</span>
        </div>
      )}
      {error && (
        <p className="rt-error">
          {error.message}
          <span className="error-code">오류 코드 {error.code}</span>
        </p>
      )}
    </div>
  );
}

/** 답글 초안 한 개: 복사·수정은 초안 오른쪽 위. [ ] 는 사장님이 채울 자리로 강조한다. */
function TemplateReply({ reply, label, toast, onCopied }) {
  const [text, setText] = useState(reply.editedContent ?? reply.content);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(reply.selected);
  const hasFillIn = /\[[^\]\n]{1,30}\]/.test(text);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(hasFillIn ? '복사 완료. 채워야 할 [ ] 항목이 남아 있습니다.' : '복사 완료');
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
    <div className={`draft ${copied ? 'is-copied' : ''}`}>
      <div className="draft-meta">
        <span className="draft-tone">{label}</span>
        {copied && <StatusIndicator tone="success" icon="confirm">복사함</StatusIndicator>}
      </div>
      <div className="draft-actions">
        <IconButton icon={editing ? 'confirm' : 'edit'} label={editing ? `${label} 수정 완료` : `${label} 수정`}
                    aria-pressed={editing} onClick={() => setEditing(!editing)} />
        <IconButton icon="copy" label={`${label} 복사`} onClick={copy} />
      </div>
      {editing ? (
        <div className="rt-edit">
          <FormInput multiline aria-label={`${label} 답글 수정`} value={text} rows={3} onChange={(e) => setText(e.target.value)} />
          <div className="end">
            <SecondaryButton tone="neutral" size="sm" onClick={() => setEditing(false)}>수정 완료</SecondaryButton>
            <PrimaryButton size="sm" icon="copy" onClick={copy}>복사</PrimaryButton>
          </div>
        </div>
      ) : (
        <p className="ai-text">
          {text.split(FILL_IN).map((part, i) => (part.startsWith('[') && part.endsWith(']')
            ? <mark key={i} className="fill-in">{part}</mark>
            : part))}
        </p>
      )}
    </div>
  );
}

/** [전화번호] 같은 가림 표시를 눈에 띄게 */
function Masked({ text }) {
  const parts = text.split(/(\[(?:전화번호|이메일|주소|주문번호|번호)\])/g);
  return parts.map((p, i) => (/^\[.+\]$/.test(p) ? <span key={i} className="mask">{p.slice(1, -1)} 마스킹</span> : p));
}
