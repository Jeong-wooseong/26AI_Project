import { useRef, useState } from 'react';
import { api } from '../api.js';
import { PLATFORMS } from '../labels.js';
import Spinner from '../components/Spinner.jsx';
import Icon from '../components/Icon.jsx';

const MAX_ROWS = 30;
const emptyRow = () => ({ key: crypto.randomUUID(), rating: 5, content: '' });

/** 화면 ② 리뷰 입력: 별점 + 본문 여러 줄 → 분류하기 */
export default function ReviewInput({ store, toast, go }) {
  const [platform, setPlatform] = useState('BAEMIN');
  const [rows, setRows] = useState([emptyRow()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputs = useRef({});

  const update = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function addRow() {
    if (rows.length >= MAX_ROWS) return;
    const row = emptyRow();
    setRows((rs) => [...rs, row]);
    setTimeout(() => inputs.current[row.key]?.focus(), 0);
  }

  async function submit(e) {
    e.preventDefault();
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
          ? `리뷰 ${results.length}개 중 ${failed}개는 분류하지 못했어요. 목록에서 다시 시도해주세요`
          : `리뷰 ${results.length}개를 분류했어요`,
      );
      setRows([emptyRow()]);
      go('reviews');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div className="page-title">
          <h1>리뷰 입력</h1>
          <p>배달앱·지도에서 오늘 리뷰를 복사해 붙여 넣어 주세요. 본문을 비우면 평점만 남긴 리뷰로 처리해요.</p>
        </div>
      </div>

      {error && (
        <div className="alert" role="alert">
          <Icon name="error" />
          <span>{error}</span>
        </div>
      )}

      <form className="section" onSubmit={submit}>
        <div className="section-body">
          <div className="field platform-field">
            <label className="label" htmlFor="platform">플랫폼</label>
            <select id="platform" className="select" value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {PLATFORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          <div className="entry-table">
            <div className="entry-row entry-head" aria-hidden="true">
              <span className="entry-no">번호</span>
              <span>별점</span>
              <span>리뷰 내용</span>
              <span className="entry-act">삭제</span>
            </div>
            {rows.map((r, i) => (
              <div className="entry-row" key={r.key}>
                <span className="entry-no">{i + 1}</span>
                <div className="cell cell-rating">
                  <select className="select" aria-label={`리뷰 ${i + 1} 별점`} value={r.rating}
                          onChange={(e) => update(r.key, { rating: Number(e.target.value) })}>
                    {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>★ {n}점</option>)}
                  </select>
                </div>
                <div className="cell cell-content">
                  <input type="text" className="input" aria-label={`리뷰 ${i + 1} 본문`} value={r.content} maxLength={2000}
                         ref={(el) => { inputs.current[r.key] = el; }}
                         placeholder="비워 두면 평점만 리뷰로 처리돼요"
                         onChange={(e) => update(r.key, { content: e.target.value })}
                         onKeyDown={(e) => {
                           if (e.key === 'Enter' && !e.nativeEvent.isComposing && i === rows.length - 1) {
                             e.preventDefault();
                             addRow();
                           }
                         }} />
                </div>
                <div className="entry-act">
                  <button type="button" className="icon-btn danger" aria-label={`리뷰 ${i + 1} 삭제`}
                          disabled={rows.length === 1}
                          onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                    <Icon name="remove" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="table-tools">
            <button type="button" className="btn btn-outline" onClick={addRow} disabled={rows.length >= MAX_ROWS}>
              <Icon name="add" />
              리뷰 추가
            </button>
            <span className="hint">총 {rows.length}개 · 최대 {MAX_ROWS}개</span>
          </div>

          <p className="notice">
            <Icon name="lock" />
            전화번호·이메일·주소·주문번호는 자동으로 가려진 뒤 AI에 전달되고, 가려진 내용만 저장돼요.
          </p>
        </div>

        <div className="section-foot">
          <div className="end">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? <Spinner /> : <Icon name="classify" />}
              {busy ? '분류 중' : '분류하기'}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
