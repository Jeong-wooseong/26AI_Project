import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { PLATFORM_LABEL, TYPE_LABEL, todayISO } from '../labels.js';
import Icon from '../components/Icon.jsx';
import { Alert, EmptyState, PageHeader, PrimaryButton, SecondaryButton } from '../components/ui.jsx';
import ReplyGenerationLoader from '../components/reply/ReplyGenerationLoader.jsx';
import { formatDateTime } from '../components/reply/replyModel.js';

const INSIGHT_STEPS = ['집계 수치 확인 중', '불만 주제 정리 중', '요약·제안 작성 중', '숫자 검토 중'];
const INSIGHT_NOTE = '요약에는 위 집계 숫자만 쓰도록 검사합니다. 응답이 오는 대로 표시합니다.';
const TYPE_ORDER = ['COMPLAINT', 'MALICIOUS', 'PRAISE', 'INQUIRY', 'RATING_ONLY', 'FAILED'];

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
/** 그 날짜가 속한 주의 월요일 */
function mondayOf(s) {
  const d = parse(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
}
const shift = (s, days) => {
  const d = parse(s);
  d.setDate(d.getDate() + days);
  return iso(d);
};
const md = (s) => {
  const d = parse(s);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
};

/** 화면 ④ 주간 리포트: 서버가 집계한 수치 + (원하면) AI 요약·개선 제안 */
export default function WeeklyReport({ store, go }) {
  const thisWeek = mondayOf(todayISO());
  const [week, setWeek] = useState(thisWeek);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [insightState, setInsightState] = useState({ state: 'idle' });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async () => {
    setError(null);
    setReport(null);
    setInsightState({ state: 'idle' });
    try {
      const r = await api.weeklyReport(store.id, week);
      if (mounted.current) setReport(r);
    } catch (e) {
      if (mounted.current) setError(e.message);
    }
  }, [store.id, week]);

  useEffect(() => {
    load();
  }, [load]);

  async function makeInsight() {
    if (insightState.state === 'loading') return;
    setInsightState({ state: 'loading' });
    try {
      const r = await api.generateInsight(store.id, week);
      if (!mounted.current) return;
      setReport(r);
      setInsightState({ state: 'idle' });
    } catch (e) {
      if (mounted.current) setInsightState({ state: 'error', error: { code: e.code, message: e.message } });
    }
  }

  const s = report?.stats;
  const isThisWeek = week === thisWeek;

  return (
    <>
      <PageHeader
        title="주간 리포트"
        description="한 주의 불만 주제와 답글 현황을 정리합니다. 수치는 등록된 리뷰를 그대로 집계합니다."
      />

      <div className="week-nav" role="group" aria-label="주 선택">
        <SecondaryButton tone="neutral" size="sm" icon="prev" aria-label="지난주" onClick={() => setWeek(shift(week, -7))} />
        <p className="week-label">
          <strong>{md(week)} ~ {md(shift(week, 6))}</strong>
          {isThisWeek && <span>이번 주</span>}
        </p>
        <SecondaryButton tone="neutral" size="sm" icon="next" aria-label="다음 주" disabled={isThisWeek}
                         onClick={() => setWeek(shift(week, 7))} />
        {!isThisWeek && <button type="button" className="text-btn" onClick={() => setWeek(thisWeek)}>이번 주로</button>}
      </div>

      {error && (
        <Alert action={<SecondaryButton tone="neutral" size="sm" icon="retry" onClick={load}>다시 불러오기</SecondaryButton>}>
          {error}
        </Alert>
      )}
      {!report && !error && <EmptyState loading description="집계하는 중" />}

      {s && s.total === 0 && (
        <EmptyState
          title="이 주에 등록된 리뷰가 없습니다"
          description={s.previousTotal ? `지난주에는 ${s.previousTotal}건이 있었습니다.` : '리뷰를 등록하면 불만 주제와 답글 현황을 주간 단위로 정리합니다.'}
          action={<PrimaryButton icon="add" onClick={() => go('input')}>리뷰 입력</PrimaryButton>}
        />
      )}

      {s && s.total > 0 && (
        <article className="report">
          <dl className="report-figures">
            <Figure label="리뷰" value={`${s.total}건`} compare={s.previousTotal ? `지난주 ${s.previousTotal}건` : '지난주 없음'}
                    delta={s.previousTotal ? <Delta diff={s.total - s.previousTotal} unit="건" /> : null} />
            <Figure label="평균 별점" value={s.avgRating?.toFixed(1) ?? '-'}
                    compare={s.previousAvgRating != null ? `지난주 ${s.previousAvgRating.toFixed(1)}` : '지난주 없음'}
                    delta={s.avgRating != null && s.previousAvgRating != null
                      ? <Delta diff={round1(s.avgRating - s.previousAvgRating)} unit="점" better="up" digits={1} /> : null} />
            <Figure label="불만 리뷰" value={`${s.complaints}건`} unit={s.complaintRate != null ? `전체의 ${s.complaintRate}%` : null}
                    compare={s.previousTotal ? `지난주 ${s.previousComplaints}건` : '지난주 없음'}
                    delta={s.previousTotal ? <Delta diff={s.complaints - s.previousComplaints} unit="건" better="down" /> : null} />
            <Figure label="답글 작성 완료" value={`${s.replies.completed}/${s.replies.target}`}
                    unit={s.replies.completionRate != null ? `${s.replies.completionRate}%` : null}
                    compare={s.previousReplies?.completionRate != null ? `지난주 ${s.previousReplies.completionRate}%` : '분류된 리뷰 기준'}
                    delta={s.replies.completionRate != null && s.previousReplies?.completionRate != null
                      ? <Delta diff={s.replies.completionRate - s.previousReplies.completionRate} unit="%p" better="up" /> : null} />
          </dl>

          <Comparison stats={s} />

          <Insight report={report} state={insightState} onMake={makeInsight} />

          <div className="report-grid">
            <section className="report-section" aria-labelledby="topics-title">
              <div className="report-section-head">
                <h2 id="topics-title">불만 주제 순위</h2>
                <p>불만 리뷰의 키워드별 리뷰 수입니다.</p>
              </div>
              {s.topics.length === 0 ? (
                <p className="report-empty">이 주에는 불만 리뷰가 없습니다.</p>
              ) : (
                <TopicTable topics={s.topics} />
              )}
            </section>

            <section className="report-section" aria-labelledby="types-title">
              <div className="report-section-head">
                <h2 id="types-title">유형별 리뷰</h2>
              </div>
              <ul className="type-list">
                {TYPE_ORDER.filter((t) => s.typeCounts[t]).map((t) => (
                  <li key={t}><span>{t === 'FAILED' ? '분류 실패' : TYPE_LABEL[t]}</span><strong>{s.typeCounts[t]}건</strong></li>
                ))}
              </ul>
              <div className="report-section-head is-sub">
                <h2>답글</h2>
              </div>
              <ul className="type-list">
                <li><span>작성 완료</span><strong>{s.replies.completed}건</strong></li>
                <li>
                  <span>직접 수정한 답글</span>
                  <strong>{s.replies.completed ? `${s.replies.edited}건 (${s.replies.editRate}%)` : '-'}</strong>
                </li>
                <li><span>중복·규칙 때문에 다시 만든 답글</span><strong>{s.replies.completed ? `${s.replies.regenerated}건` : '-'}</strong></li>
              </ul>
            </section>
          </div>

          {s.representatives.length > 0 && (
            <section className="report-section" aria-labelledby="reps-title">
              <div className="report-section-head">
                <h2 id="reps-title">대표 불만 리뷰</h2>
                <p>상위 주제마다 별점이 가장 낮은 리뷰를 골랐습니다.</p>
              </div>
              <ul className="rep-list">
                {s.representatives.map((r) => (
                  <li key={r.reviewId}>
                    <p className="rep-meta">
                      {r.topic && <span className="rep-topic">{r.topic}</span>}
                      <span className="platform">{PLATFORM_LABEL[r.platform]}</span>
                      <span className="rating" aria-label={`별점 ${r.rating}점`}><Icon name="star" size={14} />{r.rating}</span>
                      <time dateTime={r.date}>{md(r.date)}</time>
                    </p>
                    <p className="rep-text">{r.maskedContent}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
      )}
    </>
  );
}

function Figure({ label, value, unit, compare, delta }) {
  return (
    <div className="figure">
      <dt>{label}</dt>
      <dd>
        <span className="figure-value">{value}</span>
        {unit && <span className="figure-unit">{unit}</span>}
      </dd>
      <dd className="figure-compare">{compare}{delta}</dd>
    </div>
  );
}

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * 지난주 대비 증감. better: 'up'(늘면 좋음) | 'down'(줄면 좋음) | 없음(좋고 나쁨 없음).
 * 좋아지면 초록, 나빠지면 빨강. 색만으로 전하지 않도록 ▲▼와 글자를 함께 쓴다.
 */
function Delta({ diff, unit, better, digits = 0 }) {
  if (diff === 0) return <span className="delta is-flat">변화 없음</span>;
  const up = diff > 0;
  const tone = !better ? 'is-neutral' : (up === (better === 'up')) ? 'is-good' : 'is-bad';
  const word = !better ? '' : tone === 'is-good' ? ' (좋아짐)' : ' (나빠짐)';
  return (
    <span className={`delta ${tone}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      {Math.abs(diff).toFixed(digits)}{unit}
      <span className="sr-only">{up ? ' 늘어남' : ' 줄어듦'}{word}</span>
    </span>
  );
}

/** 지난주와 비교: 서버가 집계한 수치에서 좋아진 점(초록)과 나빠진 점(빨강)을 골라 보여준다 (AI 아님) */
function compareItems(s) {
  const good = [];
  const bad = [];
  const push = (ok, text) => (ok ? good : bad).push(text);
  if (s.avgRating != null && s.previousAvgRating != null) {
    const d = round1(s.avgRating - s.previousAvgRating);
    if (d !== 0) push(d > 0, `평균 별점이 ${Math.abs(d).toFixed(1)}점 ${d > 0 ? '올랐습니다' : '내려갔습니다'} (${s.previousAvgRating.toFixed(1)} → ${s.avgRating.toFixed(1)})`);
  }
  const dc = s.complaints - s.previousComplaints;
  if (dc !== 0) push(dc < 0, `불만 리뷰가 ${Math.abs(dc)}건 ${dc < 0 ? '줄었습니다' : '늘었습니다'} (${s.previousComplaints}건 → ${s.complaints}건)`);
  // 리뷰 수가 같으면 불만 비율 변화는 불만 수 변화와 같은 이야기라서 한 번만 보여준다
  if (s.complaintRate != null && s.previousComplaintRate != null && s.total !== s.previousTotal) {
    const d = s.complaintRate - s.previousComplaintRate;
    if (d !== 0) push(d < 0, `불만 비율이 ${Math.abs(d)}%p ${d < 0 ? '낮아졌습니다' : '높아졌습니다'} (${s.previousComplaintRate}% → ${s.complaintRate}%)`);
  }
  const cr = s.replies.completionRate;
  const pcr = s.previousReplies?.completionRate;
  if (cr != null && pcr != null && cr !== pcr) {
    push(cr > pcr, `답글 작성 완료율이 ${Math.abs(cr - pcr)}%p ${cr > pcr ? '높아졌습니다' : '낮아졌습니다'} (${pcr}% → ${cr}%)`);
  }
  (s.resolvedTopics ?? []).forEach((t) => push(true, `'${t.topic}' 불만이 이번 주에는 없습니다 (지난주 ${t.previousCount}건)`));
  s.topics.forEach((t) => {
    if (t.previousCount === 0) push(false, `'${t.topic}' 불만이 새로 나왔습니다 (${t.count}건)`);
    else if (t.change !== 0) push(t.change < 0, `'${t.topic}' 불만이 ${Math.abs(t.change)}건 ${t.change < 0 ? '줄었습니다' : '늘었습니다'} (${t.previousCount}건 → ${t.count}건)`);
  });
  return { good, bad };
}

function Comparison({ stats: s }) {
  if (!s.previousTotal) {
    return (
      <section className="report-section compare" aria-labelledby="compare-title">
        <div className="report-section-head">
          <h2 id="compare-title">지난주와 비교</h2>
          <p>지난주에 등록된 리뷰가 없어 비교할 수 없습니다.</p>
        </div>
      </section>
    );
  }
  const { good, bad } = compareItems(s);
  return (
    <section className="report-section compare" aria-labelledby="compare-title">
      <div className="report-section-head">
        <h2 id="compare-title">지난주와 비교</h2>
        <p>등록된 리뷰를 그대로 집계해 좋아진 점과 나빠진 점을 나눴습니다.</p>
      </div>
      {good.length === 0 && bad.length === 0 ? (
        <p className="report-empty">지난주와 크게 달라진 점이 없습니다.</p>
      ) : (
        <div className="compare-grid">
          <div className={`compare-col is-good ${good.length ? '' : 'is-empty'}`}>
            <h3>좋아진 점 <span className="compare-n">{good.length}건</span></h3>
            {good.length ? <ul>{good.map((t) => <li key={t}>{t}</li>)}</ul> : <p className="hint">없습니다.</p>}
          </div>
          <div className={`compare-col is-bad ${bad.length ? '' : 'is-empty'}`}>
            <h3>나빠진 점 <span className="compare-n">{bad.length}건</span></h3>
            {bad.length ? <ul>{bad.map((t) => <li key={t}>{t}</li>)}</ul> : <p className="hint">없습니다.</p>}
          </div>
        </div>
      )}
    </section>
  );
}

/** 이번 주 리뷰 수를 막대로 (한 가지 색, 가장 많은 주제 기준 길이). 숫자는 항상 글자로 함께 표시 */
function TopicTable({ topics }) {
  const max = Math.max(...topics.map((t) => t.count), 1);
  return (
    <table className="topic-table">
      <thead>
        <tr>
          <th scope="col">순위</th>
          <th scope="col">주제</th>
          <th scope="col">이번 주</th>
          <th scope="col" className="num">지난주</th>
          <th scope="col" className="num">변화</th>
        </tr>
      </thead>
      <tbody>
        {topics.map((t, i) => (
          <tr key={t.topic}>
            <td className="rank">{i + 1}</td>
            <th scope="row">{t.topic}</th>
            <td>
              <span className="topic-bar">
                <span className="bar" style={{ width: `${(t.count / max) * 100}%` }} aria-hidden="true" />
                <span className="count">{t.count}건</span>
              </span>
            </td>
            <td className="num">{t.previousCount}건</td>
            <td className="num"><Change topic={t} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Change({ topic: t }) {
  if (t.previousCount === 0) return <span className="change is-new">새로 나옴</span>;
  if (t.change === 0) return <span className="change">같음</span>;
  return <span className={`change ${t.change > 0 ? 'is-up' : 'is-down'}`}>{t.change > 0 ? `${t.change}건 늘어남` : `${-t.change}건 줄어듦`}</span>;
}

/** AI 요약·개선 제안: 만들지 않았으면 버튼, 만든 뒤 리뷰가 바뀌었으면 다시 만들기 안내 */
function Insight({ report, state, onMake }) {
  const insight = report.insight;
  const loading = state.state === 'loading';
  return (
    <section className="report-insight" aria-labelledby="insight-title">
      <div className="report-section-head">
        <h2 id="insight-title">AI 요약과 개선 제안</h2>
        {insight && !loading && (
          <button type="button" className="text-btn" onClick={onMake}>다시 만들기</button>
        )}
      </div>
      {loading && <ReplyGenerationLoader steps={INSIGHT_STEPS} note={INSIGHT_NOTE} pose="analyzing" />}
      {state.state === 'error' && (
        <div className="gen-error" role="alert">
          <p>{state.error.message}<span className="error-code">오류 코드 {state.error.code}</span></p>
          <SecondaryButton tone="neutral" size="sm" icon="retry" onClick={onMake}>다시 시도</SecondaryButton>
        </div>
      )}
      {!insight && !loading && state.state !== 'error' && (
        <div className="reply-empty">
          <SecondaryButton size="sm" icon="analyze" onClick={onMake}>AI 요약 만들기</SecondaryButton>
          <span className="hint">위 수치와 대표 리뷰를 바탕으로 요약과 다음 주 개선 제안을 씁니다.</span>
        </div>
      )}
      {insight && !loading && (
        <>
          {insight.stale && (
            <p className="insight-stale">
              <Icon name="info" size={16} />
              요약을 만든 뒤 이 주의 리뷰가 바뀌었습니다. 다시 만들면 최신 수치로 작성합니다.
            </p>
          )}
          <p className="insight-summary">{insight.summary}</p>
          {insight.suggestions.length > 0 && (
            <ul className="insight-suggestions">
              {insight.suggestions.map((t) => <li key={t}>{t}</li>)}
            </ul>
          )}
          <p className="hint">AI 작성 {formatDateTime(insight.generatedAt)}. 숫자는 위 집계값만 쓰도록 검사했습니다.</p>
        </>
      )}
    </section>
  );
}
