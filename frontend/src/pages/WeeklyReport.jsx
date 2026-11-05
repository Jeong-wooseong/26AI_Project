import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { progressColor } from '../progressColor.js';
import { PLATFORM_LABEL, TYPE_LABEL, todayISO } from '../labels.js';
import Icon from '../components/Icon.jsx';
import Mascot from '../components/Mascot.jsx';
import { Alert, EmptyState, PageHeader, PrimaryButton, SecondaryButton } from '../components/ui.jsx';
import ReplyGenerationLoader from '../components/reply/ReplyGenerationLoader.jsx';
import { formatDateTime } from '../components/reply/replyModel.js';

const INSIGHT_STEPS = ['집계 수치 확인 중', '좋아진 점 찾는 중', '개선할 점 정리 중', '숫자 검토 중'];
const INSIGHT_NOTE = '분석에는 이 화면의 집계 숫자만 쓰도록 검사합니다. 응답이 오는 대로 표시합니다.';
const TYPE_ORDER = ['PRAISE', 'COMPLAINT', 'MALICIOUS', 'INQUIRY', 'RATING_ONLY', 'FAILED'];
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

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
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * 화면 ④ 주간 리포트: 서버가 집계한 수치로 그린 지표·추이·유형·불만 주제 + (원하면) AI 분석.
 * 같은 숫자는 한 번만: 리뷰 수·비율은 지표 띠에, 유형별 건수는 유형 분석에, 주제별 건수는 불만 키워드에.
 */
export default function WeeklyReport({ store, go }) {
  const thisWeek = mondayOf(todayISO());
  const [week, setWeek] = useState(thisWeek);
  const [compare, setCompare] = useState(true);
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
  const canCompare = compare && !!s?.previousTotal;

  return (
    <>
      <PageHeader
        title="주간 리포트"
        description="한 주의 리뷰로 매장의 강점과 개선할 점을 찾습니다. 모든 수치는 등록된 리뷰를 그대로 집계합니다."
        actions={(
          <>
            <div className="week-nav" role="group" aria-label="분석 기간">
              <button type="button" className="icon-btn" aria-label="지난주" onClick={() => setWeek(shift(week, -7))}><Icon name="prev" /></button>
              <WeekPicker week={week} thisWeek={thisWeek} onPick={setWeek} />
              <button type="button" className="icon-btn" aria-label="다음 주" disabled={isThisWeek} onClick={() => setWeek(shift(week, 7))}>
                <Icon name="next" />
              </button>
            </div>
            <SecondaryButton tone="neutral" className="week-today" onClick={() => setWeek(thisWeek)} disabled={isThisWeek}>
              이번 주
            </SecondaryButton>
            <label className="switch">
              <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
              <span className="switch-track" aria-hidden="true" />
              지난주와 비교
            </label>
            <SecondaryButton tone="neutral" icon="download" onClick={() => window.print()} disabled={!s?.total}>
              PDF로 저장
            </SecondaryButton>
          </>
        )}
      />

      {error && (
        <Alert action={<SecondaryButton tone="neutral" size="sm" icon="retry" onClick={load}>다시 불러오기</SecondaryButton>}>
          {error}
        </Alert>
      )}
      {!report && !error && <EmptyState loading description="집계하는 중" />}

      {s && s.total === 0 && (
        <EmptyState
          title="이 주에 등록된 리뷰가 없습니다"
          description={s.previousTotal ? `지난주에는 ${s.previousTotal}건이 있었습니다. 지난주로 이동해 확인할 수 있습니다.` : '리뷰를 등록하면 한 주 단위로 추이와 불만 주제를 정리합니다.'}
          pose="thinking"
          action={<PrimaryButton icon="add" onClick={() => go('input')}>리뷰 입력</PrimaryButton>}
        />
      )}

      {s && s.total > 0 && (
        <article className="report-v3">
          <p className="print-only report-print-title">{store.name} 주간 리포트 ({md(s.weekStart)} ~ {md(s.weekEnd)})</p>
          <Metrics s={s} compare={canCompare} />

          <section className="rp-panel rp-trend" aria-labelledby="trend-title">
            <TrendSection s={s} compare={canCompare} />
          </section>

          <div className="rp-grid">
            <section className="rp-panel" aria-labelledby="types-title">
              <div className="rp-head">
                <h2 id="types-title">리뷰 유형 분석</h2>
                <p>AI가 분류한 유형별 건수입니다.</p>
              </div>
              <TypeAnalysis counts={s.typeCounts} total={s.total} />
            </section>
            <section className="rp-panel" aria-labelledby="topics-title">
              <div className="rp-head">
                <h2 id="topics-title">주요 불만 키워드</h2>
                <p>불만 리뷰에 가장 많이 나온 주제 3개{canCompare ? '와 지난주 대비 변화' : ''}입니다.</p>
              </div>
              <ComplaintTopics topics={s.topics} resolved={s.resolvedTopics ?? []} compare={canCompare} />
            </section>
          </div>

          <div className="rp-grid">
            <section className="rp-panel" aria-labelledby="rating-title">
              <div className="rp-head">
                <h2 id="rating-title">별점 분포</h2>
                <p>별점별 리뷰 수입니다.{canCompare ? ' 아래 회색 막대는 지난주입니다.' : ''}</p>
              </div>
              <RatingDistribution now={s.ratingCounts} prev={canCompare ? s.previousRatingCounts : null} />
            </section>
            <section className="rp-panel" aria-labelledby="replies-title">
              <div className="rp-head">
                <h2 id="replies-title">답글 처리</h2>
                <p>이번 주 리뷰에 작성 완료한 답글 기준입니다.</p>
              </div>
              <ReplyWork r={s.replies} />
            </section>
          </div>

          <Insight report={report} state={insightState} onMake={makeInsight} />

          {s.representatives.length > 0 && (
            <section className="rp-panel" aria-labelledby="reps-title">
              <div className="rp-head">
                <h2 id="reps-title">대표 리뷰</h2>
                <p>불만 주제마다 별점이 가장 낮은 리뷰로, AI 분석에 근거로 쓰였습니다.</p>
              </div>
              <ul className="rep-cards">
                {s.representatives.map((r) => (
                  <li key={r.reviewId}>
                    <div className="rep-card-top">
                      <span className="star-row" role="img" aria-label={`별점 ${r.rating}점`}>
                        {[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" size={13} className={n <= r.rating ? 'is-on' : ''} />)}
                      </span>
                      <span className="type-badge is-complaint">{TYPE_LABEL.COMPLAINT}</span>
                      {r.topic && <span className="rep-topic">#{r.topic}</span>}
                    </div>
                    <p className="rep-card-text">{r.maskedContent}</p>
                    <div className="rep-card-foot">
                      <span>{PLATFORM_LABEL[r.platform]}, {md(r.date)}</span>
                      <button type="button" className="text-link" onClick={() => go(`reviews?review=${r.reviewId}&all=1`)}>
                        리뷰로 이동<Icon name="next" size={14} />
                      </button>
                    </div>
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

/* ── 주 고르기: 기간을 누르면 달력이 열리고, 날짜 하나를 누르면 그 주(월~일)로 이동 ── */

const WEEK_HEAD = ['월', '화', '수', '목', '금', '토', '일'];

function WeekPicker({ week, thisWeek, onPick }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(week.slice(0, 7)); // 'YYYY-MM' 보이는 달
  const [hover, setHover] = useState(null); // 마우스를 올린 주의 월요일
  const boxRef = useRef(null);
  const btnRef = useRef(null);
  const today = todayISO();
  const year = Number(week.slice(0, 4));
  const showYear = year !== Number(today.slice(0, 4));

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  function toggle() {
    if (!open) setMonth(week.slice(0, 7));
    setOpen((v) => !v);
  }
  function pick(day) {
    onPick(mondayOf(day));
    setOpen(false);
    btnRef.current?.focus();
  }

  // 보이는 달을 덮는 주들 (월요일 시작)
  const first = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const weeks = [];
  for (let mon = mondayOf(first); mon.slice(0, 7) <= month || weeks.length === 0; mon = shift(mon, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => shift(mon, i)));
    if (weeks.length > 6) break;
  }
  const moveMonth = (n) => {
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };
  const canNext = `${month}-01` < `${thisWeek.slice(0, 7)}-01` || shift(thisWeek, 6).slice(0, 7) > month;

  return (
    <div className="week-pick" ref={boxRef}>
      <button type="button" ref={btnRef} className="week-label" aria-haspopup="dialog" aria-expanded={open} onClick={toggle}>
        <strong>{showYear ? `${year}년 ` : ''}{md(week)} ~ {md(shift(week, 6))}</strong>
        {week === thisWeek && <span>이번 주</span>}
        <Icon name="calendar" size={16} />
      </button>
      {open && (
        <div className="week-cal" role="dialog" aria-label="주 고르기">
          <div className="week-cal-head">
            <button type="button" className="icon-btn" aria-label="이전 달" onClick={() => moveMonth(-1)}><Icon name="prev" size={18} /></button>
            <strong>{y}년 {m}월</strong>
            <button type="button" className="icon-btn" aria-label="다음 달" disabled={!canNext} onClick={() => moveMonth(1)}><Icon name="next" size={18} /></button>
          </div>
          <table className="week-cal-grid" onMouseLeave={() => setHover(null)}>
            <thead><tr>{WEEK_HEAD.map((d) => <th key={d} scope="col">{d}</th>)}</tr></thead>
            <tbody>
              {weeks.map((days) => {
                const mon = days[0];
                const future = mon > thisWeek;
                const cls = [mon === week && 'is-selected', mon === hover && !future && 'is-hover', mon === thisWeek && 'is-this'].filter(Boolean).join(' ');
                return (
                  <tr key={mon} className={cls || undefined} onMouseEnter={() => setHover(mon)}>
                    {days.map((d) => (
                      <td key={d}>
                        <button type="button" disabled={future} onClick={() => pick(d)} onFocus={() => setHover(mon)}
                                className={[d.slice(0, 7) !== month && 'is-out', d === today && 'is-today'].filter(Boolean).join(' ') || undefined}
                                aria-label={`${md(d)}이 있는 주 (${md(mon)} ~ ${md(days[6])})${future ? ', 아직 오지 않은 주' : ''}`}
                                aria-current={mon === week ? 'true' : undefined}>
                          {Number(d.slice(8))}
                        </button>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="week-cal-foot">날짜를 누르면 그 날짜가 있는 주(월~일)를 봅니다.</p>
        </div>
      )}
    </div>
  );
}

/* ── 핵심 지표: 흰 띠 하나를 다섯 칸으로 ───────────────────────── */

function Metrics({ s, compare }) {
  const cr = s.replies.completionRate;
  const pcr = s.previousReplies?.completionRate;
  return (
    <section className="summary summary-5" aria-label="핵심 지표">
      <Metric label="전체 리뷰" value={s.total} unit="건"
              delta={compare && <Delta diff={s.total - s.previousTotal} unit="건" prev={`지난주 ${s.previousTotal}건`} />} />
      <Metric label="평균 별점" value={s.avgRating?.toFixed(1) ?? '-'} stars={s.avgRating}
              delta={compare && s.avgRating != null && s.previousAvgRating != null
                && <Delta diff={round1(s.avgRating - s.previousAvgRating)} unit="점" digits={1} better="up" prev={`지난주 ${s.previousAvgRating.toFixed(1)}`} />} />
      <Metric label="긍정 리뷰 비율" value={s.positiveRate ?? '-'} unit="%"
              delta={compare && s.positiveRate != null && s.previousPositiveRate != null
                && <Delta diff={s.positiveRate - s.previousPositiveRate} unit="%p" better="up" prev={`지난주 ${s.previousPositiveRate}%`} />} />
      <Metric label="불만 리뷰 비율" value={s.complaintRate ?? '-'} unit="%"
              delta={compare && s.complaintRate != null && s.previousComplaintRate != null
                && <Delta diff={s.complaintRate - s.previousComplaintRate} unit="%p" better="down" prev={`지난주 ${s.previousComplaintRate}%`} />} />
      <div className="summary-progress">
        <span className="summary-label">답글 작성 완료율<strong style={{ color: progressColor(cr).text }}>{cr ?? '-'}{cr != null && '%'}</strong></span>
        <div className="progress-track" role="img" aria-label={`답글 대상 ${s.replies.target}건 중 ${s.replies.completed}건 작성 완료`}>
          <span style={{ width: `${cr ?? 0}%`, background: progressColor(cr).bar }} />
        </div>
        <p className="summary-sub">
          {compare && cr != null && pcr != null
            ? <Delta diff={cr - pcr} unit="%p" better="up" prev={`지난주 ${pcr}%`} />
            : `대상 ${s.replies.target}건 중 ${s.replies.completed}건`}
        </p>
      </div>
    </section>
  );
}

function Metric({ label, value, unit, stars, delta }) {
  return (
    <div>
      <span className="summary-label">{label}</span>
      <p className="summary-value">
        <strong>{value}</strong>{unit}
        {stars != null && (
          <span className="star-row" role="img" aria-label={`별점 ${stars}점`}>
            {[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" size={14} className={n <= Math.round(stars) ? 'is-on' : ''} />)}
          </span>
        )}
      </p>
      <p className="summary-sub">{delta || ' '}</p>
    </div>
  );
}

/**
 * 지난주 대비 증감. better: 'up'(늘면 좋음) | 'down'(줄면 좋음) | 없음.
 * 좋아지면 초록, 나빠지면 빨강. 색만으로 전하지 않도록 ▲▼와 글자를 함께 쓴다.
 */
function Delta({ diff, unit, better, digits = 0, prev }) {
  if (diff === 0) return <span className="delta is-flat">{prev}, 변화 없음</span>;
  const up = diff > 0;
  const tone = !better ? 'is-neutral' : (up === (better === 'up')) ? 'is-good' : 'is-bad';
  return (
    <span className={`delta ${tone}`}>
      <span className="delta-prev">{prev}</span>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      {Math.abs(diff).toFixed(digits)}{unit}
      <span className="sr-only">{up ? ' 늘어남' : ' 줄어듦'}{tone === 'is-good' ? ', 좋아짐' : tone === 'is-bad' ? ', 나빠짐' : ''}</span>
    </span>
  );
}

/* ── 리뷰 추이: 날짜별 리뷰 수(막대) · 평균 별점(선) ───────────────── */

function TrendSection({ s, compare }) {
  const [table, setTable] = useState(false);
  const days = s.daily ?? [];
  const prev = s.previousDaily ?? [];
  return (
    <>
      <div className="rp-head">
        <h2 id="trend-title">리뷰 추이</h2>
        <p>날짜는 손님이 쓴 날(없으면 등록한 날) 기준입니다.</p>
        <button type="button" className="text-btn rp-head-end" aria-pressed={table} onClick={() => setTable((v) => !v)}>
          {table ? '그래프로 보기' : '표로 보기'}
        </button>
      </div>
      {table ? (
        <TrendTable days={days} prev={prev} compare={compare} />
      ) : (
        <div className="trend-charts">
          <figure className="chart">
            <figcaption>
              <strong>날짜별 리뷰 수</strong>
              <span className="chart-legend">
                <span><i className="swatch is-positive" aria-hidden="true" />긍정</span>
                <span><i className="swatch is-complaint" aria-hidden="true" />불만</span>
                <span><i className="swatch is-other" aria-hidden="true" />그 외</span>
                {compare && <span><i className="swatch-line is-prev" aria-hidden="true" />지난주 리뷰 수</span>}
              </span>
            </figcaption>
            <DailyColumns days={days} prev={compare ? prev : null} />
          </figure>
          <figure className="chart">
            <figcaption>
              <strong>평균 별점 변화</strong>
              {compare && (
                <span className="chart-legend">
                  <span><i className="swatch-line is-now" aria-hidden="true" />이번 주</span>
                  <span><i className="swatch-line is-prev" aria-hidden="true" />지난주</span>
                </span>
              )}
            </figcaption>
            <RatingLine days={days} prev={compare ? prev : null} />
          </figure>
        </div>
      )}
    </>
  );
}

const dayLabel = (d, i) => `${Number(d.date.slice(8))}(${WEEKDAYS[i]})`;

/** 하루 막대: 아래부터 긍정 · 그 외 · 불만. 지난주 같은 요일 리뷰 수는 가는 선으로 */
function DailyColumns({ days, prev }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...days.map((d) => d.total), ...(prev ?? []).map((d) => d.total));
  const top = niceMax(max);
  return (
    <div className="cols" onMouseLeave={() => setHover(null)}>
      <div className="cols-grid" aria-hidden="true">
        {[top, top / 2, 0].map((v) => <span key={v}><em>{Number.isInteger(v) ? v : v.toFixed(1)}</em></span>)}
      </div>
      <div className="cols-plot">
        {days.map((d, i) => {
          const other = d.total - d.positive - d.complaints;
          const p = prev?.[i];
          const label = `${dayLabel(d, i)}: 리뷰 ${d.total}건 (긍정 ${d.positive}, 불만 ${d.complaints}, 그 외 ${other})${p ? `, 지난주 ${p.total}건` : ''}`;
          return (
            <div key={d.date} className="col" tabIndex={0} aria-label={label}
                 onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
              <div className="col-bar" style={{ height: `${(d.total / top) * 100}%` }}>
                {d.complaints > 0 && <span className="col-seg is-complaint" style={{ flexGrow: d.complaints }} />}
                {other > 0 && <span className="col-seg is-other" style={{ flexGrow: other }} />}
                {d.positive > 0 && <span className="col-seg is-positive" style={{ flexGrow: d.positive }} />}
              </div>
              {p && p.total > 0 && <span className="col-prev" style={{ bottom: `${(p.total / top) * 100}%` }} aria-hidden="true" />}
              {d.total > 0 && <span className="col-value" style={{ bottom: `${(d.total / top) * 100}%` }} aria-hidden="true">{d.total}</span>}
              {hover === i && (
                <span className="chart-tip" role="presentation">
                  <strong>{md(d.date)} {d.total}건</strong>
                  <span><i className="tip-key is-positive" />긍정 {d.positive}</span>
                  <span><i className="tip-key is-complaint" />불만 {d.complaints}</span>
                  <span><i className="tip-key is-other" />그 외 {other}</span>
                  {p && <span><i className="tip-key is-prev" />지난주 {p.total}</span>}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="cols-axis" aria-hidden="true">
        {days.map((d, i) => <span key={d.date}>{dayLabel(d, i)}</span>)}
      </div>
    </div>
  );
}

function niceMax(n) {
  if (n <= 4) return 4;
  const step = n <= 10 ? 2 : n <= 20 ? 5 : 10;
  return Math.ceil(n / step) * step;
}

/** 폭을 재서 SVG 를 실제 픽셀로 그린다 (글자가 늘어나지 않게) */
function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** 평균 별점 선 (1~5점). 리뷰가 없는 날은 선을 끊는다 */
function RatingLine({ days, prev }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const H = 196;
  const pad = { l: 28, r: 14, t: 14, b: 28 };
  const iw = Math.max(0, w - pad.l - pad.r);
  const x = (i) => pad.l + (iw * (i + 0.5)) / 7;
  const y = (v) => pad.t + ((5 - v) / 4) * (H - pad.t - pad.b);
  const path = (list) => {
    let d = '';
    let pen = false;
    list.forEach((p, i) => {
      if (p.avgRating == null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.avgRating).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - rect.left - pad.l) / iw) * 7);
    setHover(i >= 0 && i < 7 ? i : null);
  }
  const hv = hover != null ? days[hover] : null;
  return (
    <div className="line-chart" ref={ref}>
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label={`요일별 평균 별점: ${days.map((d, i) => `${md(d.date)} ${d.avgRating ?? '리뷰 없음'}`).join(', ')}`}
             onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {[1, 2, 3, 4, 5].map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} className="grid-line" />
              <text x={pad.l - 8} y={y(v) + 4} className="axis-text" textAnchor="end">{v}</text>
            </g>
          ))}
          {days.map((d, i) => <text key={d.date} x={x(i)} y={H - 8} className="axis-text" textAnchor="middle">{dayLabel(d, i)}</text>)}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="crosshair" />}
          {prev && <path d={path(prev)} className="line is-prev" />}
          <path d={path(days)} className="line is-now" />
          {prev && prev.map((p, i) => p.avgRating != null && <circle key={`p${i}`} cx={x(i)} cy={y(p.avgRating)} r={3.5} className="dot is-prev" />)}
          {days.map((p, i) => p.avgRating != null && <circle key={i} cx={x(i)} cy={y(p.avgRating)} r={hover === i ? 5.5 : 4} className="dot is-now" />)}
        </svg>
      )}
      {hv && (
        <span className="chart-tip is-line" style={{ left: Math.min(Math.max(x(hover), 70), w - 70) }}>
          <strong>{md(hv.date)}</strong>
          <span><i className="tip-key is-now" />이번 주 {hv.avgRating != null ? `${hv.avgRating.toFixed(1)}점` : '리뷰 없음'}</span>
          {prev && <span><i className="tip-key is-prev" />지난주 {prev[hover].avgRating != null ? `${prev[hover].avgRating.toFixed(1)}점` : '리뷰 없음'}</span>}
        </span>
      )}
    </div>
  );
}

function TrendTable({ days, prev, compare }) {
  return (
    <div className="trend-table-wrap">
      <table className="trend-table">
        <caption className="sr-only">요일별 리뷰 수와 평균 별점</caption>
        <thead>
          <tr>
            <th scope="col">날짜</th><th scope="col">리뷰</th><th scope="col">긍정</th><th scope="col">불만</th><th scope="col">평균 별점</th>
            {compare && <><th scope="col">지난주 리뷰</th><th scope="col">지난주 별점</th></>}
          </tr>
        </thead>
        <tbody>
          {days.map((d, i) => (
            <tr key={d.date}>
              <th scope="row">{md(d.date)}({WEEKDAYS[i]})</th>
              <td>{d.total}</td><td>{d.positive}</td><td>{d.complaints}</td><td>{d.avgRating?.toFixed(1) ?? '-'}</td>
              {compare && <><td>{prev[i]?.total ?? '-'}</td><td>{prev[i]?.avgRating?.toFixed(1) ?? '-'}</td></>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── 리뷰 유형 분석 ───────────────────────────────────────── */

const TYPE_TONE = { PRAISE: 'praise', COMPLAINT: 'complaint', MALICIOUS: 'malicious', INQUIRY: 'inquiry', RATING_ONLY: 'rating', FAILED: 'failed' };

function TypeAnalysis({ counts, total }) {
  const types = TYPE_ORDER.filter((t) => counts[t]);
  return (
    <>
      <div className="type-bar" role="img" aria-label={types.map((t) => `${t === 'FAILED' ? '분류 실패' : TYPE_LABEL[t]} ${counts[t]}건`).join(', ')}>
        {types.map((t) => <span key={t} className={`is-${TYPE_TONE[t]}`} style={{ flexGrow: counts[t] }} />)}
      </div>
      <ul className="type-rows">
        {types.map((t) => (
          <li key={t}>
            <span className="type-row-name"><i className={`swatch is-${TYPE_TONE[t]}`} aria-hidden="true" />{t === 'FAILED' ? '분류 실패' : TYPE_LABEL[t]}</span>
            <span className="type-row-bar" aria-hidden="true"><span className={`is-${TYPE_TONE[t]}`} style={{ width: `${(counts[t] / total) * 100}%` }} /></span>
            <strong>{counts[t]}건</strong>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ── 별점 분포 (이번 주 / 지난주) ─────────────────────────── */

function RatingDistribution({ now, prev }) {
  if (!now) return null;
  const max = Math.max(1, ...now, ...(prev ?? []));
  return (
    <table className="rating-dist">
      <caption className="sr-only">별점별 리뷰 수</caption>
      <tbody>
        {[5, 4, 3, 2, 1].map((star) => (
          <tr key={star}>
            <th scope="row"><Icon name="star" size={14} className="star-inline" />{star}점</th>
            <td>
              <span className="dist-bar is-now" style={{ width: `${(now[star - 1] / max) * 100}%` }} aria-hidden="true" />
              {prev && <span className="dist-bar is-prev" style={{ width: `${(prev[star - 1] / max) * 100}%` }} aria-hidden="true" />}
            </td>
            <td className="num">
              {now[star - 1]}건{prev && <span className="dist-prev">지난주 {prev[star - 1]}건</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── 답글 처리: 작성 완료율은 지표 띠에 있으므로 여기서는 수정·재생성만 ── */

function ReplyWork({ r }) {
  if (!r.completed) return <p className="hint">이번 주 리뷰에 작성 완료한 답글이 아직 없습니다.</p>;
  return (
    <ul className="reply-work">
      <li>
        <span>사장님이 직접 고친 답글</span>
        <strong>{r.edited}건 <small>작성 완료의 {r.editRate}%</small></strong>
      </li>
      <li>
        <span>중복·규칙 때문에 다시 만든 답글</span>
        <strong>{r.regenerated}건</strong>
      </li>
    </ul>
  );
}

/* ── 주요 불만 키워드 TOP 3 ────────────────────────────────── */

function ComplaintTopics({ topics, resolved, compare }) {
  const [showAll, setShowAll] = useState(false);
  const top = topics.slice(0, 3);
  const rest = topics.slice(3);
  if (top.length === 0) {
    return (
      <div className="rp-empty">
        <Mascot pose="happy" size={56} />
        <p>이 주에는 불만 리뷰가 없습니다.{compare && resolved.length > 0 && ` 지난주에 있던 '${resolved[0].topic}' 불만도 없어졌어요.`}</p>
      </div>
    );
  }
  const max = Math.max(...top.map((t) => t.count), 1);
  return (
    <>
      <ol className="topic-top">
        {top.map((t, i) => (
          <li key={t.topic}>
            <span className={`rank-no ${i === 0 ? 'is-top' : ''}`}>{i + 1}</span>
            <span className="topic-top-main">
              <strong>{t.topic}</strong>
              <span className="rank-bar" aria-hidden="true"><span style={{ width: `${(t.count / max) * 100}%` }} /></span>
            </span>
            <span className="topic-top-count">{t.count}건</span>
            {compare && <Change topic={t} />}
          </li>
        ))}
      </ol>
      {rest.length > 0 && (
        <>
          <button type="button" className="text-link topic-more" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
            {showAll ? '나머지 주제 접기' : <>나머지 주제 {rest.length}개 보기<Icon name="next" size={14} /></>}
          </button>
          {showAll && (
            <ul className="topic-rest">
              {rest.map((t) => (
                <li key={t.topic}><span>{t.topic}</span><strong>{t.count}건</strong>{compare && <Change topic={t} />}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {compare && resolved.length > 0 && (
        <p className="topic-resolved">
          <Icon name="confirm" size={15} />
          지난주에 있던 {resolved.slice(0, 2).map((t) => `'${t.topic}'`).join(', ')} 불만은 이번 주에 없습니다.
        </p>
      )}
    </>
  );
}

function Change({ topic: t }) {
  if (t.previousCount === 0) return <span className="change-chip is-bad">새로 나옴</span>;
  if (t.change === 0) return <span className="change-chip">지난주와 같음</span>;
  return (
    <span className={`change-chip ${t.change > 0 ? 'is-bad' : 'is-good'}`}>
      {t.change > 0 ? '▲' : '▼'} {Math.abs(t.change)}건
      <span className="sr-only">{t.change > 0 ? ' 늘어남' : ' 줄어듦'}</span>
    </span>
  );
}

/* ── AI 분석 인사이트 ─────────────────────────────────────── */

function Insight({ report, state, onMake }) {
  const insight = report.insight;
  const loading = state.state === 'loading';
  const cols = insight && [
    ['positives', '이번 주 좋아진 점', 'is-good', insight.positives],
    ['improvements', '개선이 필요한 부분', 'is-bad', insight.improvements],
    ['suggestions', '바로 해볼 수 있는 제안', 'is-action', insight.suggestions],
  ];
  return (
    <section className="rp-panel rp-insight" aria-labelledby="insight-title">
      <div className="rp-head">
        <span className="ai-title-mascot"><Mascot pose={loading ? 'analyzing' : 'smile'} size={34} /></span>
        <div>
          <h2 id="insight-title">AI 분석 인사이트</h2>
          <p>위 집계 수치와 대표 리뷰만 근거로 씁니다. 집계에 없는 숫자를 쓰면 다시 만듭니다.</p>
        </div>
        {insight && !loading && (
          <SecondaryButton tone="neutral" size="sm" icon="retry" className="rp-head-end" onClick={onMake}>다시 분석</SecondaryButton>
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
          <PrimaryButton icon="analyze" onClick={onMake}>AI 분석 만들기</PrimaryButton>
          <span className="hint">좋아진 점, 개선할 점, 다음 주에 바로 해볼 제안 2~3개를 씁니다.</span>
        </div>
      )}
      {insight && !loading && (
        <>
          {insight.stale && (
            <p className="insight-stale">
              <Icon name="info" size={16} />
              분석을 만든 뒤 이 주의 리뷰가 바뀌었습니다. 다시 분석하면 최신 수치로 작성합니다.
            </p>
          )}
          <p className="insight-lead">{insight.summary}</p>
          <div className="insight-cols">
            {cols.map(([key, title, tone, items]) => (
              <div key={key} className={`insight-col ${tone}`}>
                <h3>{title}</h3>
                {items?.length ? (
                  <ul>{items.map((t) => <li key={t}>{t}</li>)}</ul>
                ) : <p className="hint">{key === 'positives' ? '집계에서 뚜렷한 개선을 찾지 못했습니다.' : key === 'improvements' ? '눈에 띄는 개선 필요 사항이 없습니다.' : '제안이 없습니다.'}</p>}
              </div>
            ))}
          </div>
          <p className="insight-foot"><Icon name="clock" size={14} />{formatDateTime(insight.generatedAt)}에 이 주의 집계와 대표 리뷰로 작성</p>
        </>
      )}
    </section>
  );
}
