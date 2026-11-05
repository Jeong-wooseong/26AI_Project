import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { PLATFORMS, PLATFORM_LABEL, SENTIMENT_LABEL, TYPES, TYPE_LABEL, todayISO } from '../labels.js';
import Icon from '../components/Icon.jsx';
import {
  Alert, EmptyState, FormInput, FormSelect, IconButton, PageHeader, PrimaryButton,
  SecondaryButton,
} from '../components/ui.jsx';
import ReplyDraftPanel from '../components/reply/ReplyDraftPanel.jsx';
import FinalReply from '../components/reply/FinalReply.jsx';
import MaliciousGuidePanel from '../components/reply/MaliciousGuidePanel.jsx';
import { DRAFT_TONES, DRAFT_TYPES, finalReplyOf, formatDateTime, statusOf, textOf } from '../components/reply/replyModel.js';
import { prefersReducedMotion } from '../components/reply/ReplyTypingText.jsx';
import Mascot from '../components/Mascot.jsx';
import BulkReplyPanel from '../components/reply/BulkReplyPanel.jsx';

const PAGE_SIZE = 10;
// 작성 완료: 리뷰 원문과 최종 답글 중심 / 작성 대기·분류 실패: 분류 결과와 초안 작업
const TABS = [
  ['wait', '작성 대기'],
  ['done', '작성 완료'],
  ['fail', '분류 실패'],
];
const TYPE_TONE = { PRAISE: 'praise', COMPLAINT: 'complaint', MALICIOUS: 'malicious', INQUIRY: 'inquiry', RATING_ONLY: 'rating' };
/**
 * 화면 ③ 오늘의 리뷰.
 *  요약 띠(등록·평균 별점·답글 필요·진행률) → 한 판 안에 왼쪽 리뷰 목록 + 오른쪽 선택한 리뷰의 답글 작업.
 *  같은 숫자는 한 번만: 상태별 개수는 요약 띠에만, 유형별 개수는 목록 탭에만 보여준다.
 */
export default function ReviewList({ store, toast, go, initialTab }) {
  const [date, setDate] = useState(todayISO()); // '' 이면 전체 기간 (이력 조회)
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ALL'); // 유형
  const [status, setStatus] = useState(TABS.some(([k]) => k === initialTab) ? initialTab : 'wait');
  const [platform, setPlatform] = useState('ALL');
  const [page, setPage] = useState(1);
  const [reviews, setReviews] = useState(null);
  const [error, setError] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false); // 답글 일괄 처리 패널
  const [selectedId, setSelectedId] = useState(null);
  const detailRef = useRef(null);
  const lastIndex = useRef(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      setReviews(await api.listReviews(store.id, { date: date || undefined }));
    } catch (e) {
      setError(e.message);
    }
  }, [store.id, date]);

  useEffect(() => {
    setReviews(null);
    load();
  }, [load]);

  // 거르는 조건이 바뀌면 첫 페이지로
  useEffect(() => setPage(1), [date, filter, platform, status, query]);

  function changeTab(key) {
    setStatus(key);
    setFilter('ALL');
    setBulkOpen(false);
    // 새로고침해도 같은 탭이 열리도록 주소에 남긴다
    window.history.replaceState(null, '', key === 'wait' ? '#reviews' : `#reviews/${key}`);
  }

  const replace = (updated) => setReviews((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
  const remove = (id) => setReviews((rs) => rs.filter((x) => x.id !== id));

  const all = reviews ?? [];
  const q = query.trim().toLowerCase();
  // 검색: 리뷰 본문, 키워드, 최종 답글 문장
  const matches = (r) => !q || [r.maskedContent, ...(r.keywords ?? []), finalReplyOf(r) && textOf(finalReplyOf(r))]
    .some((t) => t && t.toLowerCase().includes(q));
  const list = all.filter((r) => (platform === 'ALL' || r.platform === platform) && matches(r));
  const byStatus = list.filter((r) => statusOf(r) === status);
  const typeCounts = byStatus.reduce((m, r) => {
    if (r.type) m[r.type] = (m[r.type] ?? 0) + 1;
    return m;
  }, {});
  const visible = byStatus.filter((r) => filter === 'ALL' || r.type === filter);
  const isToday = date === todayISO();
  const allTime = !date;
  const isDone = status === 'done';

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const paged = visible.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const usedPlatforms = PLATFORMS.filter(([v]) => all.some((r) => r.platform === v) || v === platform);

  // 작성 완료하거나 삭제해서 목록에서 빠지면 같은 자리의 다음 리뷰로 넘어간다
  const selectedIndex = paged.findIndex((r) => r.id === selectedId);
  if (selectedIndex >= 0) lastIndex.current = selectedIndex;
  const selected = selectedIndex >= 0 ? paged[selectedIndex] : paged[Math.min(lastIndex.current, paged.length - 1)];

  function select(id) {
    setSelectedId(id);
    detailRef.current?.scrollTo({ top: 0 });
    // 한 줄로 쌓이는 좁은 화면에서는 작업 영역으로 내려간다
    if (window.matchMedia?.('(max-width: 860px)').matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    }
  }

  const title = allTime ? '전체 리뷰' : isToday ? '오늘의 리뷰' : '지난 리뷰';

  return (
    <>
      <PageHeader
        title={title}
        description="새로 들어온 리뷰를 확인하고 AI 답글 초안을 골라 완성합니다."
        actions={(
          <>
            <FormInput id="reviewDate" label="등록일" hideLabel type="date" icon="calendar" fieldClassName="filter-date"
                       value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)}
                       onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* 지원하지 않는 브라우저는 직접 입력 */ } }} />
            <SecondaryButton tone="neutral" className={`period-btn ${allTime ? 'is-on' : ''}`} aria-pressed={allTime}
                             onClick={() => setDate(allTime ? todayISO() : '')}>
              전체 기간
            </SecondaryButton>
            <PrimaryButton icon="add" onClick={() => go('input')}>리뷰 입력</PrimaryButton>
          </>
        )}
      />

      {error && (
        <Alert action={<SecondaryButton tone="neutral" size="sm" icon="retry" onClick={load}>다시 불러오기</SecondaryButton>}>
          {error}
        </Alert>
      )}

      {reviews === null && !error && <EmptyState loading description="불러오는 중" />}
      {reviews && reviews.length === 0 && (
        <EmptyState
          title={allTime ? '등록된 리뷰 없음' : isToday ? '오늘 등록된 리뷰 없음' : '해당 날짜의 리뷰 없음'}
          description="리뷰 입력 메뉴에서 리뷰를 등록하면 유형별로 분류됩니다."
          pose="smile"
          action={<PrimaryButton icon="add" onClick={() => go('input')}>리뷰 등록</PrimaryButton>}
        />
      )}

      {all.length > 0 && (
        <>
          <Summary reviews={list} date={date} />

          <section className="workspace" aria-label="리뷰 목록과 답글 작업">
            <div className="review-panel">
              <div className="review-panel-head">
                <div className="seg" role="group" aria-label="답글 상태">
                  {TABS.map(([key, label]) => (
                    <button key={key} type="button" className={`seg-btn is-${key}`} aria-pressed={status === key}
                            onClick={() => changeTab(key)}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="review-panel-tools">
                  <FormInput id="reviewSearch" label="리뷰·답글 검색" hideLabel type="search" icon="search" fieldClassName="filter-search"
                             placeholder="리뷰·답글 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
                  <FormSelect id="platformFilter" label="리뷰 출처" hideLabel value={platform} fieldClassName="filter-platform"
                              options={[['ALL', '전체 출처'], ...usedPlatforms]} onChange={(e) => setPlatform(e.target.value)} />
                </div>
              </div>
              <div className="type-tabs" role="group" aria-label="유형으로 거르기">
                <button type="button" className="type-tab" aria-pressed={filter === 'ALL'} onClick={() => setFilter('ALL')}>
                  전체 <span>{byStatus.length}</span>
                </button>
                {TYPES.filter(([key]) => typeCounts[key] || filter === key).map(([key, label]) => (
                  <button key={key} type="button" className="type-tab" aria-pressed={filter === key}
                          onClick={() => setFilter(filter === key ? 'ALL' : key)}>
                    {label} <span>{typeCounts[key] ?? 0}</span>
                  </button>
                ))}
              </div>

              {status === 'wait' && visible.length > 0 && (
                <div className="review-panel-bulk">
                  <SecondaryButton size="sm" icon="classify" aria-expanded={bulkOpen} onClick={() => setBulkOpen((v) => !v)}>
                    답글 일괄 처리
                  </SecondaryButton>
                  <span className="hint">여러 리뷰의 초안을 한 번에 만들고 확정합니다.</span>
                </div>
              )}

              {visible.length === 0 ? (
                <EmptyTab status={status} searching={!!q || platform !== 'ALL'} />
              ) : (
                <ul className="review-list" aria-label="리뷰 목록">
                  {paged.map((r) => (
                    <QueueItem key={r.id} review={r} selected={!(bulkOpen && status === 'wait') && r === selected} onSelect={() => { setBulkOpen(false); select(r.id); }} />
                  ))}
                </ul>
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
            </div>

            {/* 선택한 리뷰만 보이고, 나머지는 생성 중인 작업을 잃지 않도록 숨긴 채 유지한다 */}
            <div className="detail-panel" ref={detailRef} aria-label="선택한 리뷰의 답글 작업">
              {bulkOpen && status === 'wait' && visible.length > 0 ? (
                <BulkReplyPanel reviews={visible} onUpdated={replace} onClose={() => setBulkOpen(false)} toast={toast} />
              ) : !selected ? (
                <div className="detail-empty">
                  <Mascot pose="smile" size={72} />
                  <p>왼쪽 목록에서 리뷰를 고르면 여기에서 답글을 작성합니다.</p>
                </div>
              ) : null}
              {paged.map((r) => {
                const hidden = r !== selected || (bulkOpen && status === 'wait');
                return isDone
                  ? <CompletedRow key={r.id} review={r} hidden={hidden} onUpdated={replace} onDeleted={remove} toast={toast} />
                  : <Ticket key={r.id} review={r} hidden={hidden} onUpdated={replace} onDeleted={remove} toast={toast} />;
              })}
            </div>
          </section>
        </>
      )}
    </>
  );
}

/** 요약 띠: 지금 날짜·출처·검색 조건의 리뷰로 센다 (유형 필터와는 무관) */
function Summary({ reviews, date }) {
  const total = reviews.length;
  const rated = reviews.filter((r) => r.rating);
  const avg = rated.length ? rated.reduce((n, r) => n + r.rating, 0) / rated.length : null;
  const low = reviews.filter((r) => r.rating <= 2).length;
  const counts = reviews.reduce((m, r) => ({ ...m, [statusOf(r)]: m[statusOf(r)] + 1 }), { done: 0, wait: 0, fail: 0 });
  const malicious = reviews.filter((r) => statusOf(r) === 'wait' && r.type === 'MALICIOUS').length;
  const target = counts.done + counts.wait;
  const pct = target ? Math.round((counts.done / target) * 100) : 0;
  const sources = reviews.reduce((m, r) => ({ ...m, [r.platform]: (m[r.platform] ?? 0) + 1 }), {});
  const bySource = Object.entries(sources).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${PLATFORM_LABEL[k]} ${n}건`).join(', ');
  const scope = !date ? '전체 기간' : date === todayISO() ? '오늘' : `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일`;
  return (
    <section className="summary" aria-label="리뷰 요약">
      <div>
        <span className="summary-label">{scope} 등록된 리뷰</span>
        <p className="summary-value"><strong>{total}</strong>건</p>
        <p className="summary-sub">{bySource || '등록된 리뷰 없음'}</p>
      </div>
      <div>
        <span className="summary-label">평균 별점</span>
        <p className="summary-value">
          <strong>{avg != null ? avg.toFixed(1) : '-'}</strong>
          {avg != null && <Stars rating={Math.round(avg)} size={14} />}
        </p>
        <p className="summary-sub">{low ? `낮은 별점(1~2점) ${low}건` : '낮은 별점(1~2점) 없음'}</p>
      </div>
      <div>
        <span className="summary-label">답글이 필요한 리뷰</span>
        <p className="summary-value"><strong className={counts.wait ? 'is-attention' : ''}>{counts.wait}</strong>건</p>
        <p className="summary-sub">
          {counts.fail ? <span className="is-danger">분류 실패 {counts.fail}건 따로 확인</span>
            : malicious ? `악성 ${malicious}건은 대응 가이드 필요` : '악성·분류 실패 없음'}
        </p>
      </div>
      <div className="summary-progress">
        <span className="summary-label">답글 진행률<strong>{pct}%</strong></span>
        <div className="progress-track" role="img" aria-label={`답글 대상 ${target}건 중 ${counts.done}건 작성 완료`}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="summary-sub">{target}건 중 {counts.done}건 작성 완료</p>
      </div>
    </section>
  );
}

function Stars({ rating, size = 14 }) {
  return (
    <span className="star-row" role="img" aria-label={`별점 ${rating}점`}>
      {[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" size={size} className={n <= rating ? 'is-on' : ''} />)}
    </span>
  );
}

function EmptyTab({ status, searching }) {
  if (searching) return <p className="list-empty">조건에 맞는 리뷰가 없습니다. 검색어나 출처를 바꿔 보십시오.</p>;
  const text = {
    wait: '답글이 필요한 리뷰가 없습니다. 모든 답글을 작성했어요.',
    done: '작성 완료한 답글이 없습니다. 작성 대기에서 초안을 고르고 작성 완료를 누르면 여기에 모입니다.',
    fail: '분류에 실패한 리뷰가 없습니다.',
  }[status];
  return (
    <div className="list-empty">
      <Mascot pose={status === 'done' ? 'thinking' : 'done'} size={72} />
      <p>{text}</p>
    </div>
  );
}

/** 작성 완료 행: 리뷰 원문 → 최종 답글. 초안은 보여주지 않는다. */
function CompletedRow({ review: r, hidden, onUpdated, onDeleted, toast }) {
  const reply = finalReplyOf(r);
  // 완료한 뒤 다른 시각(분 단위)에 고쳤을 때만 수정 시각을 따로 보여준다
  const edited = r.finalUpdatedAt && r.completedAt && formatDateTime(r.finalUpdatedAt) !== formatDateTime(r.completedAt);

  async function save(text) {
    try {
      // 대응 답글은 처음 확정할 때 사장님 확인을 거쳤으므로 그대로 확인 상태로 저장한다
      onUpdated(await api.completeReply(r.id, reply.id, text, reply.tone === 'GUIDE'));
      toast.show('최종 답글을 저장했습니다.');
      return true;
    } catch (e) {
      toast.show(`저장하지 못했습니다: ${e.message}`);
      return false;
    }
  }

  return (
    <article className="thread is-done" hidden={hidden}>
      <DetailHead review={r}>
        <DeleteReview review={r} onDeleted={onDeleted} toast={toast} />
      </DetailHead>
      <Original review={r} />
      {reply && (
        <FinalReply reply={reply} onSave={save} toast={toast}
                    meta={`${formatDateTime(r.completedAt)} 작성 완료${edited ? `, ${formatDateTime(r.finalUpdatedAt)} 수정` : ''}`} />
      )}
    </article>
  );
}

/** 작성 대기·분류 실패 행: 분류 결과와 답글 초안 작업 */
function Ticket({ review: r, hidden, onUpdated, onDeleted, toast }) {
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

  async function generateGuide(strategy) {
    if (generation.state === 'loading') return; // 중복 요청 방지
    setGeneration({ state: 'loading', strategy });
    try {
      const updated = await api.maliciousGuide(r.id, strategy);
      if (!mounted.current) return;
      onUpdated(updated);
      setGeneration({ state: 'idle' });
    } catch (e) {
      if (mounted.current) setGeneration({ state: 'error', strategy, error: { code: e.code, message: e.message } });
    }
  }

  async function complete(replyId, text, confirmed = false) {
    try {
      onUpdated(await api.completeReply(r.id, replyId, text, confirmed));
      toast.show('작성 완료로 저장했습니다. 작성 완료 탭에서 확인할 수 있습니다.');
      return true;
    } catch (e) {
      toast.show(`저장하지 못했습니다: ${e.message}`);
      return false;
    }
  }

  const malicious = !failed && r.type === 'MALICIOUS';
  const hasReplyArea = !failed && !malicious && (r.replies.length > 0 || DRAFT_TYPES.includes(r.type));

  return (
    <article className={`thread ${failed ? 'is-failed' : ''} ${malicious ? 'is-malicious' : ''}`} hidden={hidden}>
      <DetailHead review={r}>
        {failed && (
          <SecondaryButton tone="neutral" size="sm" icon={retrying ? 'loading' : 'retry'} onClick={retry} disabled={retrying}>
            재분류
          </SecondaryButton>
        )}
        <DeleteReview review={r} onDeleted={onDeleted} toast={toast} disabled={generation.state === 'loading'} />
      </DetailHead>
      <Original review={r} showAnalysis={!failed} />

      {failed && (
        <div className="reply-zone">
          <p className="thread-error">
            {retryError ? retryError.message : failureText(r.failureCode)}
            <span className="error-code">오류 코드 {retryError?.code ?? r.failureCode ?? 'LLM_FAILED'}</span>
          </p>
        </div>
      )}

      {hasReplyArea && (
        <ReplyDraftPanel review={r} generation={generation} onGenerate={generate} onComplete={complete} toast={toast} />
      )}

      {malicious && (
        <div className="reply-zone">
          <MaliciousGuidePanel review={r} generation={generation} onGenerate={generateGuide} onComplete={complete} toast={toast} />
        </div>
      )}
    </article>
  );
}

/** 상세 머리: 유형·출처·시각, 별점 + 오른쪽 관리 버튼 */
function DetailHead({ review: r, children }) {
  const failed = r.status === 'FAILED';
  return (
    <header className="detail-head">
      <div>
        <p className="detail-meta">
          {failed ? <TypeBadge type="FAILED" /> : <TypeBadge type={r.type} />}
          <span>{PLATFORM_LABEL[r.platform]}</span>
          {r.writtenAt ? <span>작성일 {r.writtenAt}</span> : <time dateTime={r.createdAt}>{formatDateTime(r.createdAt)} 등록</time>}
        </p>
        <p className="detail-title"><Stars rating={r.rating} size={16} /><strong>{r.rating}점 리뷰</strong></p>
      </div>
      <div className="detail-head-actions">{children}</div>
    </header>
  );
}

function TypeBadge({ type }) {
  if (type === 'FAILED') return <span className="type-badge is-failed">분류 실패</span>;
  return <span className={`type-badge is-${TYPE_TONE[type]}`}>{TYPE_LABEL[type]}</span>;
}

/** 손님이 쓴 리뷰 원문 + 분석 결과 */
function Original({ review: r, showAnalysis = true }) {
  return (
    <section className="original" aria-label="손님 리뷰">
      <span className="section-label">손님 리뷰</span>
      <blockquote className={r.maskedContent ? '' : 'is-empty'}>
        {r.maskedContent ? <Masked text={r.maskedContent} /> : '본문 없이 별점만 남긴 리뷰'}
      </blockquote>
      <p className="meta">
        {showAnalysis && r.keywords?.length > 0 && <span className="kw">{r.keywords.map((k) => `#${k}`).join(' ')}</span>}
        {showAnalysis && r.type !== 'RATING_ONLY' && r.sentiment && <span>{SENTIMENT_LABEL[r.sentiment]}</span>}
        {showAnalysis && r.type !== 'RATING_ONLY' && r.confidence != null && <span>확신도 {Math.round(r.confidence * 100)}%</span>}
        {r.similarCount > 0 && <SimilarNote count={r.similarCount} />}
        {r.injectionSuspected && <InjectionNote />}
        {r.ratingMismatch && (
          <span className="similar-note" title={r.ratingMismatch === 'HIGH_RATING_NEGATIVE'
            ? '별점은 높지만 본문에 불만이 있습니다. 답글은 본문의 불만을 중심으로 만듭니다.'
            : '별점은 낮지만 본문은 긍정적입니다. 답글은 칭찬에 감사하고 아쉬운 점을 부드럽게 묻습니다.'}>
            별점과 내용이 다름
          </span>
        )}
        {r.riskSignals?.length > 0 && (
          <span className="risk-note" title="원인 인정이나 환불·보상 약속 없이 매장 연락을 안내하는 초안을 만듭니다. 답글을 쓰기 전에 주문 내역과 상황을 직접 확인하십시오.">
            사장님 확인 필요: {r.riskSignals.join(', ')}
          </span>
        )}
      </p>
    </section>
  );
}

/** 왼쪽 목록의 한 건: 유형·출처·시각, 별점, 리뷰 앞 두 줄, 답글 상태 */
function QueueItem({ review: r, selected, onSelect }) {
  const failed = r.status === 'FAILED';
  const drafts = r.replies.filter((p) => p.id !== r.finalReplyId).length;
  let state;
  if (failed) state = <span className="item-state is-fail"><Icon name="error" size={14} />분류 실패, 재분류 필요</span>;
  else if (statusOf(r) === 'done') state = <span className="item-state is-done"><Icon name="confirm" size={14} />작성 완료 {formatDateTime(r.completedAt)}</span>;
  else if (r.type === 'MALICIOUS') state = <span className="item-state is-guide"><Icon name="guide" size={14} />{drafts ? '대응 가이드 확인 전' : '대응 가이드 필요'}</span>;
  else state = <span className="item-state"><Icon name="sparkles" size={14} />{drafts ? `AI 초안 ${drafts}개 준비됨` : '초안 만들기 전'}</span>;
  return (
    <li>
      <button type="button" className="review-item" aria-current={selected ? 'true' : undefined} onClick={onSelect}>
        <span className="item-top">
          <TypeBadge type={failed ? 'FAILED' : r.type} />
          <span className="item-source">{PLATFORM_LABEL[r.platform]}</span>
          <span className="item-time">{r.writtenAt ? r.writtenAt.slice(5).replace('-', '.') : formatDateTime(r.createdAt).slice(6)}</span>
        </span>
        <Stars rating={r.rating} size={13} />
        <span className={`item-text ${r.maskedContent ? '' : 'is-empty'}`}>{r.maskedContent || '본문 없이 별점만 남긴 리뷰'}</span>
        <span className="item-foot">{state}<Icon name="next" size={16} /></span>
      </button>
    </li>
  );
}

/** 중복 방지 1단: 최근 7일 안에 내용이 비슷한 리뷰가 있으면 알린다 (답글은 서로 다른 표현으로 생성) */
/** 리뷰 삭제: 한 번 더 확인한 뒤 리뷰와 그 답글(초안·최종)을 지운다. 되돌릴 수 없다. */
function DeleteReview({ review: r, onDeleted, toast, disabled }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrap = useRef(null);

  useEffect(() => {
    if (!asking) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !wrap.current?.contains(e.target)) setAsking(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [asking]);

  async function remove() {
    setBusy(true);
    try {
      await api.deleteReview(r.id);
      onDeleted(r.id);
      toast.show('리뷰를 삭제했습니다.');
    } catch (e) {
      toast.show(`삭제하지 못했습니다: ${e.message}`);
      setBusy(false);
    }
  }

  return (
    <span className="del-wrap" ref={wrap}>
      <IconButton icon="delete" tone="danger" size="sm" label="리뷰 삭제" aria-expanded={asking}
                  disabled={disabled || busy} onClick={() => setAsking((v) => !v)} />
      {asking && (
        <span className="del-pop" role="dialog" aria-label="리뷰 삭제 확인">
          <span className="del-pop-text">
            이 리뷰를 삭제할까요?
            <span className="hint">{r.finalReplyId != null ? '최종 답글도 함께 삭제되며' : '답글 초안도 함께 삭제되며'} 되돌릴 수 없습니다.</span>
          </span>
          <span className="del-pop-actions">
            <button type="button" className="act-btn" onClick={() => setAsking(false)} disabled={busy}>취소</button>
            <button type="button" className="btn btn-danger btn-sm" onClick={remove} disabled={busy} autoFocus>
              {busy ? '삭제 중…' : '삭제'}
            </button>
          </span>
        </span>
      )}
    </span>
  );
}

function SimilarNote({ count }) {
  return (
    <span className="similar-note" title="최근 7일 안에 내용이 비슷한 리뷰입니다. 답글 초안은 그 리뷰의 답글과 겹치지 않게 만듭니다.">
      비슷한 리뷰 {count}건
    </span>
  );
}

/** 리뷰 본문에 AI 에게 보내는 지시문으로 보이는 문장이 있을 때. 분류·답글 생성은 그 문장을 따르지 않는다 */
function InjectionNote() {
  return (
    <span className="similar-note" title="리뷰에 AI 답글 생성기를 겨냥한 지시문으로 보이는 문장이 있습니다. 답글은 그 문장을 따르지 않고 별점과 리뷰 내용에만 답합니다.">
      지시문 포함 리뷰
    </span>
  );
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



/** [전화번호] 같은 가림 표시를 눈에 띄게 */
function Masked({ text }) {
  const parts = text.split(/(\[(?:전화번호|이메일|주소|주문번호|번호)\])/g);
  return parts.map((p, i) => (/^\[.+\]$/.test(p) ? <span key={i} className="mask">{p.slice(1, -1)} 마스킹</span> : p));
}
