import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { PLATFORMS, todayISO } from '../labels.js';
import { statusOf } from '../components/reply/replyModel.js';
import StarRating from '../components/StarRating.jsx';
import Mascot from '../components/Mascot.jsx';
import Icon from '../components/Icon.jsx';
import {
  Alert, DataTable, DataTableHead, DataTableRow, FormInput, FormSelect, IconButton, PageHeader, PrimaryButton, TabPanel,
} from '../components/ui.jsx';
import PastePanel from '../components/import/PastePanel.jsx';
import FilePanel from '../components/import/FilePanel.jsx';

const MAX_ROWS = 30;
const MAX_LENGTH = 2000; // 리뷰 본문 최대 글자 수 (기존 maxLength 와 동일)
const MODES = [
  { key: 'manual', label: '직접 입력', icon: 'manual', desc: '한 건씩 별점과 내용을 입력' },
  { key: 'paste', label: '여러 리뷰 붙여넣기', icon: 'paste', desc: '배달앱에서 복사한 리뷰를 한 번에' },
  { key: 'file', label: '파일 가져오기', icon: 'file', desc: 'CSV·엑셀 파일의 리뷰를 불러오기' },
];

/** 입력 방식 고르기: 탭과 같은 역할(←/→ 키 이동)을 하는 선택 카드 */
function ModeCards({ value, onChange }) {
  function onKeyDown(e) {
    const i = MODES.findIndex((m) => m.key === value);
    const n = e.key === 'ArrowRight' ? (i + 1) % MODES.length : e.key === 'ArrowLeft' ? (i - 1 + MODES.length) % MODES.length : null;
    if (n == null) return;
    e.preventDefault();
    onChange(MODES[n].key);
    document.getElementById(`input-mode-tab-${MODES[n].key}`)?.focus();
  }
  return (
    <div className="mode-cards" role="tablist" aria-label="입력 방식">
      {MODES.map((m) => (
        <button key={m.key} type="button" role="tab" id={`input-mode-tab-${m.key}`} aria-controls={`input-mode-panel-${m.key}`}
                aria-selected={value === m.key} tabIndex={value === m.key ? 0 : -1} className="mode-card"
                onClick={() => onChange(m.key)} onKeyDown={onKeyDown}>
          <span className="mode-card-icon"><Icon name={m.icon} size={20} /></span>
          <span className="mode-card-text">
            <span className="mode-card-label">{m.label}</span>
            <span className="mode-card-desc">{m.desc}</span>
          </span>
          <span className="mode-card-radio" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
const ENTRY_COLUMNS = [
  { label: '번호', className: 'entry-no' },
  { label: '별점' },
  { label: '리뷰 내용' },
  { label: '', className: 'entry-act' },
];
// 새 행은 별점을 비워 둔다: 아무것도 고르지 않은 행은 '빈 행'으로 보고 등록하지 않는다
const emptyRow = () => ({ key: crypto.randomUUID(), rating: null, content: '' });
const LEAVE_MS = 180;
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** 행 상태: empty(빈 행) | rating(평점만) | full(내용+별점) | missing(내용은 있는데 별점 없음) */
function rowState(r) {
  const text = r.content.trim().length > 0;
  if (r.rating == null) return text ? 'missing' : 'empty';
  return text ? 'full' : 'rating';
}

/** 등록 전 입력 내용은 이 브라우저에만 임시 저장한다 (다른 기기·서버로 가지 않음) */
const draftKey = (storeId) => `replyboss.input-draft.${storeId}`;
function loadDraft(storeId) {
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey(storeId)) ?? 'null');
    if (!saved?.rows?.length) return null;
    return { platform: saved.platform, rows: saved.rows.slice(0, MAX_ROWS).map((r) => ({ ...emptyRow(), rating: r.rating ?? null, content: r.content ?? '' })) };
  } catch {
    return null;
  }
}
function saveDraft(storeId, platform, rows) {
  try {
    const kept = rows.filter((r) => rowState(r) !== 'empty').map(({ rating, content }) => ({ rating, content }));
    if (kept.length) localStorage.setItem(draftKey(storeId), JSON.stringify({ platform, rows: kept }));
    else localStorage.removeItem(draftKey(storeId));
    return kept.length > 0;
  } catch {
    return false;
  }
}

/** 화면 ② 리뷰 입력: 별점 + 본문 여러 줄 → 분류하기 */
export default function ReviewInput({ store, toast, go }) {
  const [restored] = useState(() => loadDraft(store.id));
  const [platform, setPlatform] = useState(restored?.platform ?? 'BAEMIN');
  const [rows, setRows] = useState(restored?.rows ?? [emptyRow()]);
  const [savedDraft, setSavedDraft] = useState(!!restored);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false); // 등록을 눌렀을 때만 별점 누락을 표시
  const [leaving, setLeaving] = useState(() => new Set()); // 삭제 중인 행 (짧게 사라지는 효과 뒤에 지움)
  const [error, setError] = useState(null);
  const inputs = useRef({});
  const [mode, setMode] = useState('manual');
  const [pasteRows, setPasteRows] = useState([]);
  const [fileRows, setFileRows] = useState([]);
  const [today, setToday] = useState(null); // 오늘 등록된 리뷰 현황 (실제 목록에서 셈)

  useEffect(() => {
    let alive = true;
    api.listReviews(store.id, { date: todayISO() })
      .then((list) => {
        if (!alive) return;
        const by = { done: 0, wait: 0, fail: 0 };
        list.forEach((r) => { by[statusOf(r)] += 1; });
        setToday({ total: list.length, ...by });
      })
      .catch(() => alive && setToday(null));
    return () => { alive = false; };
  }, [store.id]);

  // 화면에서 고른 출처를 따르는 미리보기 행은 출처를 바꾸면 함께 바뀐다 (파일 값·직접 고른 값은 유지)
  useEffect(() => {
    const follow = (rs) => rs.map((r) => (r.platformFrom === 'default' && r.state !== 'done' && r.platform !== platform
      ? { ...r, platform, serverDup: false } : r));
    setPasteRows(follow);
    setFileRows(follow);
  }, [platform]);

  // 입력이 멈추면 잠시 뒤 임시 저장 (등록하면 지운다)
  useEffect(() => {
    const t = setTimeout(() => setSavedDraft(saveDraft(store.id, platform, rows)), 400);
    return () => clearTimeout(t);
  }, [store.id, platform, rows]);

  const update = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function addRow() {
    if (rows.length >= MAX_ROWS) return;
    const row = emptyRow();
    setRows((rs) => [...rs, row]);
    setTimeout(() => inputs.current[row.key]?.focus(), 0);
  }

  // 행 삭제 후에도 키보드 위치를 잃지 않도록 바로 아래(마지막 행이면 위) 행으로 포커스를 옮긴다
  function removeRow(key) {
    const i = rows.findIndex((r) => r.key === key);
    const next = rows[i + 1] ?? rows[i - 1];
    const drop = () => {
      setRows((rs) => rs.filter((x) => x.key !== key));
      setLeaving((s) => { const n = new Set(s); n.delete(key); return n; });
      if (next) setTimeout(() => inputs.current[next.key]?.focus(), 0);
    };
    if (reduceMotion()) {
      drop();
      return;
    }
    setLeaving((s) => new Set(s).add(key));
    setTimeout(drop, LEAVE_MS);
  }

  // Enter: 다음 행으로 이동, 마지막 행이면 새 행 추가 (폼이 실수로 제출되지 않게)
  function onContentKeyDown(e, i) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (i === rows.length - 1) addRow();
    else inputs.current[rows[i + 1].key]?.focus();
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return; // 분류 요청 중 중복 제출 방지
    setChecked(true);
    const missing = rows.map((r, i) => (rowState(r) === 'missing' ? i + 1 : null)).filter(Boolean);
    if (missing.length) {
      setError(`별점을 고르지 않은 리뷰가 있습니다 (${missing.join(', ')}번 행). 별점을 고른 뒤 다시 등록하십시오.`);
      return;
    }
    const targets = rows.filter((r) => r.rating != null);
    if (targets.length === 0) {
      setError('등록할 리뷰가 없습니다. 별점을 고르고, 리뷰 내용이 있으면 함께 입력하십시오.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const results = await api.createReviews(
        store.id,
        platform,
        targets.map((r) => ({ rating: Number(r.rating), content: r.content })),
      );
      const failed = results.filter((r) => r.status === 'FAILED').length;
      toast.show(
        failed
          ? `리뷰 ${results.length}건 등록 완료 (분류 실패 ${failed}건, 목록에서 재분류 가능)`
          : `리뷰 ${results.length}건 등록 및 분류 완료`,
      );
      setRows([emptyRow()]);
      saveDraft(store.id, platform, []);
      setChecked(false);
      go('reviews/wait'); // 방금 등록한 리뷰는 작성 대기에서 답글을 만든다
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const full = rows.length >= MAX_ROWS;
  // 입력 현황: 빈 행은 빼고, 별점이 있는 행만 유효한 리뷰로 센다 (평균 별점도 유효한 리뷰 기준)
  const states = rows.map(rowState);
  const nFull = states.filter((s) => s === 'full').length;
  const nRating = states.filter((s) => s === 'rating').length;
  const nEmpty = states.filter((s) => s === 'empty').length;
  const valid = rows.filter((r) => r.rating != null);
  const modeTitle = { manual: '리뷰 직접 입력', paste: '여러 리뷰 붙여넣기', file: '파일 가져오기' }[mode];
  const modeDesc = {
    manual: '출처를 고르고 별점과 리뷰 내용을 순서대로 입력하십시오.',
    paste: '배달앱에서 복사한 리뷰를 붙여 넣으면 한 건씩 나눠 미리 보여 줍니다.',
    file: 'CSV·엑셀 파일을 올리면 열을 맞춰 리뷰를 불러옵니다.',
  }[mode];

  return (
    <>
      <PageHeader
        title="리뷰 입력"
        description="고객 리뷰를 등록하면 AI가 유형을 나누고, 작성 대기에서 답글 초안을 만듭니다."
        actions={today && (
          <dl className="head-stats" aria-label="오늘 등록한 리뷰">
            <div><dt>오늘 등록</dt><dd>{today.total}</dd></div>
            <div><dt>작성 완료</dt><dd>{today.done}</dd></div>
            <div><dt>답글 작성 대기</dt><dd className="is-primary">{today.wait}</dd></div>
          </dl>
        )}
      />

      {error && <Alert>{error}</Alert>}

      <ModeCards value={mode} onChange={setMode} />

      <div className="input-layout">
        <section className="input-panel" aria-labelledby="input-panel-title">
          <header className="input-panel-head">
            <div>
              <h2 id="input-panel-title">{modeTitle}</h2>
              <p>{modeDesc}</p>
            </div>
            <div className="input-panel-tools">
              <FormSelect id="platform" label="리뷰 출처" fieldClassName="field-inline platform-field" value={platform}
                          options={PLATFORMS} onChange={(e) => setPlatform(e.target.value)} />
              {mode === 'manual' && (
                <p className="input-count" aria-live="polite">
                  {savedDraft && <span className="draft-saved"><i aria-hidden="true" />임시 저장됨</span>}
                  <span><strong>{valid.length}</strong> / {MAX_ROWS}건</span>
                </p>
              )}
            </div>
          </header>

          <TabPanel idPrefix="input-mode" tabKey="manual" active={mode === 'manual'}>
            <form id="manual-review-form" className="tab-form" onSubmit={submit}>
              <DataTable label="입력할 리뷰" className="entry-table" aria-rowcount={rows.length + 1}>
                <DataTableHead columns={ENTRY_COLUMNS} />
                {rows.map((r, i) => (
                  <DataTableRow key={r.key}
                                className={`entry-row is-${states[i]} ${leaving.has(r.key) ? 'is-leaving' : ''} ${checked && states[i] === 'missing' ? 'is-invalid' : ''}`}>
                    <span className="entry-no" role="cell">{String(i + 1).padStart(2, '0')}</span>
                    <div className="cell-rating" role="cell">
                      <StarRating label={`리뷰 ${i + 1} 별점`} value={r.rating}
                                  onChange={(n) => update(r.key, { rating: n })} />
                      {checked && states[i] === 'missing' && <span className="field-error rating-missing">별점을 고르십시오</span>}
                    </div>
                    <div className="cell-content" role="cell">
                      <FormInput aria-label={`리뷰 ${i + 1} 본문`} value={r.content} maxLength={MAX_LENGTH}
                                 ref={(el) => { inputs.current[r.key] = el; }}
                                 placeholder="고객 리뷰 내용을 입력하십시오. 비우면 별점만 등록합니다."
                                 counter={states[i] === 'full' || states[i] === 'rating'
                                   ? <span className="entry-done"><Icon name="confirm" size={13} />{states[i] === 'full' ? '입력 완료' : '별점만'}</span>
                                   : null}
                                 counterInside
                                 onChange={(e) => update(r.key, { content: e.target.value })}
                                 onKeyDown={(e) => onContentKeyDown(e, i)} />
                    </div>
                    <div className="entry-act" role="cell">
                      <IconButton icon="delete" tone="danger" label={`리뷰 ${i + 1} 삭제`}
                                  disabled={rows.length === 1} onClick={() => removeRow(r.key)} />
                    </div>
                  </DataTableRow>
                ))}
              </DataTable>

              <div className="table-tools">
                <button type="button" className="add-row" onClick={addRow} disabled={full}>
                  <Icon name="add" size={18} />{full ? '최대 30건까지 입력할 수 있습니다' : '리뷰 행 추가'}
                </button>
                {valid.length === 0 && !busy ? (
                  <span className="table-start">
                    <Mascot pose="smile" size={36} />
                    <span className="hint">별점을 누르고 리뷰 내용을 붙여 넣으세요.</span>
                  </span>
                ) : (
                  <span className="hint"><kbd>Enter</kbd> 다음 행으로 이동</span>
                )}
              </div>

              <footer className="input-panel-foot">
                <p className="hint" aria-live="polite">
                  {busy ? (
                    <span className="input-busy"><Mascot pose="analyzing" size={28} />리뷰를 등록하고 유형을 나누는 중입니다.</span>
                  ) : valid.length > 0 && (nRating || nEmpty) ? (
                    <>
                      {nRating > 0 && `별점만 있는 리뷰 ${nRating}건은 별점 템플릿 답글로 처리합니다.`}
                      {nEmpty > 0 && ` 빈 행 ${nEmpty}개는 빼고 등록합니다.`}
                    </>
                  ) : (
                    '별점을 고른 리뷰만 등록합니다. 입력 내용은 등록 전까지 이 브라우저에 임시 저장됩니다.'
                  )}
                </p>
                <PrimaryButton type="submit" icon="classify" loading={busy} loadingText="처리 중">
                  등록 및 분류
                </PrimaryButton>
              </footer>
            </form>
          </TabPanel>

          <TabPanel idPrefix="input-mode" tabKey="paste" active={mode === 'paste'}>
            <div className="input-panel-body">
              <PastePanel store={store} platform={platform} rows={pasteRows} setRows={setPasteRows} toast={toast} go={go} />
            </div>
          </TabPanel>

          <TabPanel idPrefix="input-mode" tabKey="file" active={mode === 'file'}>
            <div className="input-panel-body">
              <FilePanel store={store} platform={platform} rows={fileRows} setRows={setFileRows} toast={toast} go={go} />
            </div>
          </TabPanel>
        </section>

        <aside className="privacy-panel" aria-labelledby="privacy-title">
          <span className="privacy-icon"><Icon name="shield" size={22} /></span>
          <h2 id="privacy-title">개인정보는 자동으로 가려요</h2>
          <p>리뷰를 분석하기 전에 아래 정보가 보이면 가린 뒤 저장합니다.</p>
          <ul className="privacy-list">
            <li><Icon name="confirm" size={15} />전화번호와 이메일 주소</li>
            <li><Icon name="confirm" size={15} />집 주소</li>
            <li><Icon name="confirm" size={15} />주문번호</li>
          </ul>
          <div className="privacy-example" aria-label="가리기 예시">
            <span className="section-label">입력한 내용</span>
            <p>010-2345-6789로 연락 주세요</p>
            <span className="section-label">저장·AI 전달 내용</span>
            <p className="is-masked"><span className="mask">전화번호 마스킹</span>로 연락 주세요</p>
          </div>
          <div className="privacy-scope">
            <strong>AI에 전달되는 내용</strong>
            <p>별점과 가린 뒤의 리뷰 본문만 분류와 답글 작성에 씁니다.</p>
            <a href="#privacy">개인정보 처리방침 보기<Icon name="next" size={14} /></a>
          </div>
        </aside>
      </div>
    </>
  );
}
