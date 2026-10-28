// 일괄 등록 미리보기: 추출·가져온 리뷰를 확인·수정·제외한 뒤 등록한다.
// 등록은 기존 리뷰 등록 API(api.createReviews)를 출처별 30건 단위로 나눠 호출한다.
// 중간에 실패해도 이미 등록된 행은 '등록 완료'로 표시돼 다시 보내지 않는다.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { PLATFORMS, todayISO } from '../labels.js';
import { CHUNK_SIZE, batchDuplicates, isRegistrable, rowStatus } from '../import/rows.js';
import { MAX_CONTENT_LENGTH } from '../import/normalize.js';
import {
  Alert, DataTable, DataTableHead, DataTableRow, FormInput, FormSelect, IconButton, PrimaryButton, SecondaryButton, StatusIndicator,
} from './ui.jsx';

const RATING_OPTIONS = [5, 4, 3, 2, 1].map((n) => [n, `${n}점`]);
const STATUS_TONE = { done: 'success', excluded: 'neutral', error: 'danger', duplicate: 'complaint', warn: 'neutral', ready: 'inquiry' };
const STATUS_ICON = { done: 'confirm', error: 'error' };
const COLUMNS = [
  { label: '번호', className: 'bulk-no-head' },
  { label: '출처' },
  { label: '별점' },
  { label: '리뷰 내용' },
  { label: '상태' },
  { label: '제외', className: 'bulk-act' },
];
const VIEWS = [
  ['ALL', '전체'],
  ['error', '확인 필요'],
  ['duplicate', '중복'],
  ['excluded', '제외'],
  ['done', '등록 완료'],
];

/** 이미 등록된 리뷰와 같은 행을 서버에 확인한다 (본문 있는 행만). 반환: 중복인 행 id 집합 */
async function findServerDuplicates(storeId, rows) {
  const targets = rows.filter((r) => r.content.trim() && r.platform);
  const dup = new Set();
  for (let i = 0; i < targets.length; i += 300) {
    const part = targets.slice(i, i + 300);
    const { duplicateIndexes } = await api.checkDuplicates(storeId, part.map((r) => ({ platform: r.platform, content: r.content })));
    duplicateIndexes.forEach((idx) => dup.add(part[idx].id));
  }
  return dup;
}

export default function BulkPreview({ store, rows, setRows, batchId, toast, go, onReset, resetLabel = '초기화' }) {
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total }
  const [error, setError] = useState(null);
  const [view, setView] = useState('ALL');

  const patch = (id, change) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...change } : r)));

  // 새 목록이 만들어질 때마다 이미 등록된 리뷰와의 중복을 확인한다
  useEffect(() => {
    if (!rows.length) return undefined;
    let cancelled = false;
    setChecking(true);
    setCheckError(null);
    setError(null);
    setView('ALL');
    findServerDuplicates(store.id, rows)
      .then((dup) => {
        if (!cancelled && dup.size) setRows((rs) => rs.map((r) => (dup.has(r.id) ? { ...r, serverDup: true } : r)));
      })
      .catch((e) => !cancelled && setCheckError(e.message))
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const dupOf = useMemo(() => batchDuplicates(rows), [rows]);
  const statuses = useMemo(() => new Map(rows.map((r) => [r.id, rowStatus(r, dupOf.get(r.id))])), [rows, dupOf]);
  const count = (key) => [...statuses.values()].filter((s) => s.key === key).length;
  const registrable = rows.filter((r) => r.state === 'pending' && isRegistrable(r, dupOf.get(r.id)));
  const shown = rows
    .map((r, i) => ({ row: r, no: i + 1, status: statuses.get(r.id) }))
    .filter(({ status }) => view === 'ALL' || status.key === view);

  async function register() {
    if (busy || !registrable.length) return;
    setBusy(true);
    setError(null);
    let targets = registrable;
    // 앞선 시도에서 응답만 못 받고 저장된 경우를 대비해 보내기 직전에 한 번 더 확인
    try {
      const dup = await findServerDuplicates(store.id, targets.filter((r) => !r.allowDup));
      if (dup.size) {
        setRows((rs) => rs.map((r) => (dup.has(r.id) ? { ...r, serverDup: true } : r)));
        targets = targets.filter((r) => !dup.has(r.id));
      }
    } catch {
      // 확인에 실패해도 등록은 진행한다 (화면 위쪽에 안내가 이미 표시됨)
    }

    const chunks = [];
    for (const [platform] of PLATFORMS) {
      const same = targets.filter((r) => r.platform === platform);
      for (let i = 0; i < same.length; i += CHUNK_SIZE) chunks.push({ platform, rows: same.slice(i, i + CHUNK_SIZE) });
    }
    const total = targets.length;
    let done = 0;
    let classifyFailed = 0;
    setProgress({ done, total });
    let stopped = null;
    for (const chunk of chunks) {
      try {
        const results = await api.createReviews(
          store.id,
          chunk.platform,
          chunk.rows.map((r) => ({ rating: r.rating, content: r.content, writtenAt: r.writtenAt })),
        );
        const ids = new Set(chunk.rows.map((r) => r.id));
        setRows((rs) => rs.map((r) => (ids.has(r.id) ? { ...r, state: 'done' } : r)));
        classifyFailed += results.filter((x) => x.status === 'FAILED').length;
        done += chunk.rows.length;
        setProgress({ done, total });
      } catch (e) {
        stopped = e.message;
        break;
      }
    }
    setBusy(false);
    setProgress(null);

    if (stopped) {
      setError(`${done}건 등록 후 중단되었습니다: ${stopped.replace(/\.?$/, '.')} 다시 등록하면 남은 리뷰만 전송합니다.`);
      return;
    }
    toast.show(classifyFailed
      ? `${done}건 등록 완료 (분류 실패 ${classifyFailed}건, 목록에서 재분류 가능)`
      : `${done}건 등록 및 분류 완료`);
    const remaining = rows.filter((r) => r.state === 'pending' && !targets.some((t) => t.id === r.id) && !r.excluded);
    if (!remaining.length) go('reviews');
  }

  if (!rows.length) return null;

  return (
    <div className="bulk">
      <div className="bulk-head">
        <div className="bulk-counts" aria-live="polite">
          <span>전체 <strong>{rows.length}</strong></span>
          <span>등록 대상 <strong>{registrable.length}</strong></span>
          <span className={count('error') ? 'is-error' : ''}>확인 필요 <strong>{count('error')}</strong></span>
          <span>중복 <strong>{count('duplicate')}</strong></span>
          <span>제외 <strong>{count('excluded')}</strong></span>
          {count('done') > 0 && <span className="is-done">등록 완료 <strong>{count('done')}</strong></span>}
          {checking && <span className="hint">중복 확인 중…</span>}
        </div>
        <FormSelect label="보기" hideLabel value={view} options={VIEWS} onChange={(e) => setView(e.target.value)}
                    fieldClassName="bulk-view" />
      </div>

      {checkError && <Alert>이미 등록된 리뷰와의 중복을 확인하지 못했습니다: {checkError}</Alert>}
      {error && <Alert>{error}</Alert>}

      <DataTable label="등록할 리뷰 미리보기" className="bulk-table" scroll>
        <DataTableHead columns={COLUMNS} />
        {shown.length === 0 && <p className="dt-empty">해당하는 행이 없습니다.</p>}
        {shown.map(({ row: r, no, status }) => {
          const locked = r.state === 'done' || busy;
          return (
            <DataTableRow key={r.id} className={`bulk-row is-${status.key}`}>
              <span className="bulk-no" role="cell">{no}<small>{r.source}</small></span>
              <div role="cell" className="bulk-platform">
                <FormSelect aria-label={`${no}번 출처`} value={r.platform ?? ''} disabled={locked}
                            options={r.platform ? PLATFORMS : [['', '선택'], ...PLATFORMS]}
                            onChange={(e) => patch(r.id, { platform: e.target.value || null, platformFrom: 'user', serverDup: false })} />
              </div>
              <div role="cell" className="bulk-rating">
                <FormSelect icon="star" aria-label={`${no}번 별점`} value={r.rating ?? ''} disabled={locked}
                            options={r.rating ? RATING_OPTIONS : [['', '선택'], ...RATING_OPTIONS]}
                            onChange={(e) => patch(r.id, { rating: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div role="cell" className="bulk-content">
                <FormInput multiline aria-label={`${no}번 리뷰 내용`} value={r.content} disabled={locked}
                           rows={Math.min(4, Math.max(1, r.content.split('\n').length))} placeholder="(본문 없음, 별점만 등록)"
                           error={r.content.length > MAX_CONTENT_LENGTH ? `${MAX_CONTENT_LENGTH}자 초과` : null}
                           onChange={(e) => patch(r.id, { content: e.target.value, serverDup: false })} />
                <div className="bulk-meta">
                  <FormInput type="date" aria-label={`${no}번 작성일`} value={r.writtenAt ?? ''} disabled={locked}
                             fieldClassName="bulk-date" max={todayISO()}
                             onChange={(e) => patch(r.id, { writtenAt: e.target.value || null })} />
                  {r.author && <span>작성자 {r.author} <em>(확인용, 저장 안 함)</em></span>}
                  {r.raw && (
                    <details className="bulk-raw">
                      <summary>원문</summary>
                      <pre>{r.raw}</pre>
                    </details>
                  )}
                </div>
                {status.detail && status.key !== 'done' && (
                  <ul className={`bulk-notes is-${status.key}`}>
                    {status.detail.map((d) => <li key={d}>{d}</li>)}
                  </ul>
                )}
                {status.key === 'duplicate' && (
                  <button type="button" className="text-btn" onClick={() => patch(r.id, { allowDup: true })}>중복이어도 등록</button>
                )}
              </div>
              <span role="cell" className="bulk-status">
                <StatusIndicator tone={STATUS_TONE[status.key]} icon={STATUS_ICON[status.key]}>{status.label}</StatusIndicator>
              </span>
              <span role="cell" className="bulk-act">
                {r.state !== 'done' && (
                  <IconButton icon={r.excluded ? 'restore' : 'remove'} tone={r.excluded ? undefined : 'danger'}
                              label={r.excluded ? `${no}번 다시 포함` : `${no}번 제외`} disabled={busy}
                              onClick={() => patch(r.id, { excluded: !r.excluded })} />
                )}
              </span>
            </DataTableRow>
          );
        })}
      </DataTable>

      <div className="bulk-foot">
        <span className="hint">확인 필요, 중복, 제외 행은 등록되지 않습니다. 출처별로 {CHUNK_SIZE}건씩 나눠 등록합니다.</span>
        <div className="end">
          <SecondaryButton tone="neutral" onClick={onReset} disabled={busy}>{resetLabel}</SecondaryButton>
          <PrimaryButton icon="classify" onClick={register} disabled={!registrable.length || checking} loading={busy}
                         loadingText={progress ? `등록 중 ${progress.done}/${progress.total}` : '등록 중'}>
            {registrable.length}건 등록 및 분류
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
