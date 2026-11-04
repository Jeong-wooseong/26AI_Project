import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { PLATFORMS, todayISO } from '../labels.js';
import { statusOf } from '../components/reply/replyModel.js';
import StarRating from '../components/StarRating.jsx';
import Icon from '../components/Icon.jsx';
import {
  Alert, DataTable, DataTableHead, DataTableRow, FormInput, FormSelect, IconButton, PageHero, PrimaryButton,
  SecondaryButton, SectionCard, TabPanel,
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
        </button>
      ))}
    </div>
  );
}
const ENTRY_COLUMNS = [
  { label: '번호', className: 'entry-no' },
  { label: '별점' },
  { label: '리뷰 내용' },
  { label: '삭제', className: 'entry-act' },
];
const emptyRow = () => ({ key: crypto.randomUUID(), rating: 5, content: '' });

/** 화면 ② 리뷰 입력: 별점 + 본문 여러 줄 → 분류하기 */
export default function ReviewInput({ store, toast, go }) {
  const [platform, setPlatform] = useState('BAEMIN');
  const [rows, setRows] = useState([emptyRow()]);
  const [busy, setBusy] = useState(false);
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
    setRows((rs) => rs.filter((x) => x.key !== key));
    if (next) setTimeout(() => inputs.current[next.key]?.focus(), 0);
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
    setBusy(true);
    setError(null);
    try {
      const results = await api.createReviews(
        store.id,
        platform,
        rows.map((r) => ({ rating: Number(r.rating), content: r.content })),
      );
      const failed = results.filter((r) => r.status === 'FAILED').length;
      toast.show(
        failed
          ? `리뷰 ${results.length}건 등록 완료 (분류 실패 ${failed}건, 목록에서 재분류 가능)`
          : `리뷰 ${results.length}건 등록 및 분류 완료`,
      );
      setRows([emptyRow()]);
      go('reviews/wait'); // 방금 등록한 리뷰는 작성 대기에서 답글을 만든다
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const full = rows.length >= MAX_ROWS;
  const withText = rows.filter((r) => r.content.trim()).length;
  const avg = rows.reduce((sum, r) => sum + Number(r.rating), 0) / rows.length;

  return (
    <>
      <PageHero
        eyebrow="리뷰 입력"
        title="오늘 들어온 리뷰를 등록해 보세요"
        description="등록하면 AI가 리뷰 유형을 분류하고, 작성 대기에서 답글 초안을 만듭니다. 별점만 있는 리뷰는 답글 초안이 바로 만들어집니다."
        pose="happy"
        steps={[
          { label: '리뷰 등록', state: 'current' },
          { label: 'AI 분류', state: 'todo' },
          { label: '답글 초안 · 작성 완료', state: 'todo' },
        ]}
        stats={today && [
          { label: '오늘 등록', value: today.total, unit: '건' },
          { label: '작성 완료', value: today.done, unit: '건', tone: 'success' },
          { label: '작성 대기', value: today.wait, unit: '건', tone: today.wait ? 'warning' : undefined },
        ]}
      />

      {error && <Alert>{error}</Alert>}

      <ModeCards value={mode} onChange={setMode} />

      <SectionCard
        aria-label="리뷰 입력"
        header={(
          <>
            <span className="section-label">{MODES.find((m) => m.key === mode)?.label}</span>
            <FormSelect id="platform" label="리뷰 출처" fieldClassName="field-inline platform-field" value={platform}
                        options={PLATFORMS} onChange={(e) => setPlatform(e.target.value)} />
          </>
        )}
        stickyFooter
        footerStart={mode === 'manual' && (
          <div className="entry-summary" aria-live="polite">
            <span className="row-count">
              {full && <span className="row-count-full">최대 개수 도달</span>}
              <strong>{rows.length}</strong> / {MAX_ROWS}건
            </span>
            <span className="count-bar" aria-hidden="true"><span style={{ width: `${(rows.length / MAX_ROWS) * 100}%` }} /></span>
            <span className="entry-summary-text">
              내용 있음 {withText} · 별점만 {rows.length - withText} · 평균 <Icon name="star" size={14} className="star-inline" />{avg.toFixed(1)}
            </span>
          </div>
        )}
        footer={mode === 'manual' && (
          <PrimaryButton type="submit" form="manual-review-form" icon="classify" loading={busy} loadingText="처리 중">
            등록 및 분류
          </PrimaryButton>
        )}
      >
        <p className="notice">
          <Icon name="lock" size={16} />
          <span>전화번호, 이메일, 주소, 주문번호는 자동으로 마스킹되며 마스킹된 내용만 AI에 전달·저장됩니다.</span>
        </p>

        <TabPanel idPrefix="input-mode" tabKey="manual" active={mode === 'manual'}>
          <form id="manual-review-form" className="tab-form" onSubmit={submit}>
            <DataTable label="입력할 리뷰" className="entry-table" aria-rowcount={rows.length + 1}>
              <DataTableHead columns={ENTRY_COLUMNS} />
              {rows.map((r, i) => (
                <DataTableRow key={r.key} className={`entry-row ${r.content.trim() ? 'is-filled' : ''}`}>
                  <span className="entry-no" role="cell">{i + 1}</span>
                  <div className="cell-rating" role="cell">
                    <StarRating label={`리뷰 ${i + 1} 별점`} value={Number(r.rating)}
                                onChange={(n) => update(r.key, { rating: n })} />
                  </div>
                  <div className="cell-content" role="cell">
                    <FormInput aria-label={`리뷰 ${i + 1} 본문`} value={r.content} maxLength={MAX_LENGTH}
                               ref={(el) => { inputs.current[r.key] = el; }}
                               placeholder="고객이 작성한 리뷰 내용 (비우면 별점만 등록)"
                               counter={r.content ? `${r.content.length}/${MAX_LENGTH}` : null} counterInside
                               onChange={(e) => update(r.key, { content: e.target.value })}
                               onKeyDown={(e) => onContentKeyDown(e, i)} />
                  </div>
                  <div className="entry-act" role="cell">
                    <IconButton icon="remove" tone="danger" label={`리뷰 ${i + 1} 삭제`}
                                disabled={rows.length === 1} onClick={() => removeRow(r.key)} />
                  </div>
                </DataTableRow>
              ))}
            </DataTable>

            <div className="table-tools">
              <SecondaryButton icon="add" onClick={addRow} disabled={full}>행 추가</SecondaryButton>
              <span className="hint">Enter로 다음 행 이동, 마지막 행에서는 새 행 추가</span>
            </div>
          </form>
        </TabPanel>

        <TabPanel idPrefix="input-mode" tabKey="paste" active={mode === 'paste'}>
          <PastePanel store={store} platform={platform} rows={pasteRows} setRows={setPasteRows} toast={toast} go={go} />
        </TabPanel>

        <TabPanel idPrefix="input-mode" tabKey="file" active={mode === 'file'}>
          <FilePanel store={store} platform={platform} rows={fileRows} setRows={setFileRows} toast={toast} go={go} />
        </TabPanel>
      </SectionCard>
    </>
  );
}
