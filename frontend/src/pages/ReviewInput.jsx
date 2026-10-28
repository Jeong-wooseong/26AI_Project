import { useRef, useState } from 'react';
import { api } from '../api.js';
import { PLATFORMS } from '../labels.js';
import Icon from '../components/Icon.jsx';
import { Alert, FormInput, FormSelect, IconButton, PageHeader, PrimaryButton, SecondaryButton, SectionCard } from '../components/ui.jsx';

const MAX_ROWS = 30;
const MAX_LENGTH = 2000; // 리뷰 본문 최대 글자 수 (기존 maxLength 와 동일)
const RATING_OPTIONS = [5, 4, 3, 2, 1].map((n) => [n, `${n}점`]);
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

  const full = rows.length >= MAX_ROWS;

  return (
    <>
      <PageHeader
        title="리뷰 입력"
        description="배달앱·지도에서 오늘 리뷰를 복사해 붙여 넣어 주세요. 본문을 비우면 평점만 남긴 리뷰로 처리해요."
      />

      {error && <Alert>{error}</Alert>}

      <SectionCard
        as="form"
        onSubmit={submit}
        aria-label="리뷰 입력"
        footer={
          <PrimaryButton type="submit" icon="classify" loading={busy} loadingText="분류 중">
            분류하기
          </PrimaryButton>
        }
      >
        <FormSelect id="platform" label="플랫폼" fieldClassName="platform-field" value={platform}
                    options={PLATFORMS} onChange={(e) => setPlatform(e.target.value)} />

        <div className="entry-table" role="table" aria-label="입력할 리뷰" aria-rowcount={rows.length + 1}>
          <div className="entry-row entry-head" role="row">
            <span className="entry-no" role="columnheader">번호</span>
            <span role="columnheader">별점</span>
            <span role="columnheader">리뷰 내용</span>
            <span className="entry-act" role="columnheader">삭제</span>
          </div>
          {rows.map((r, i) => (
            <div className={`entry-row ${r.content.trim() ? 'is-filled' : ''}`} key={r.key} role="row">
              <span className="entry-no" role="cell">{i + 1}</span>
              <div className="cell cell-rating" role="cell">
                <FormSelect icon="star" aria-label={`리뷰 ${i + 1} 별점`} value={r.rating} options={RATING_OPTIONS}
                            onChange={(e) => update(r.key, { rating: Number(e.target.value) })} />
              </div>
              <div className="cell cell-content" role="cell">
                <FormInput aria-label={`리뷰 ${i + 1} 본문`} value={r.content} maxLength={MAX_LENGTH}
                           ref={(el) => { inputs.current[r.key] = el; }}
                           placeholder="비워 두면 평점만 리뷰로 처리돼요"
                           counter={r.content ? `${r.content.length}/${MAX_LENGTH}` : null} counterInside
                           onChange={(e) => update(r.key, { content: e.target.value })}
                           onKeyDown={(e) => onContentKeyDown(e, i)} />
              </div>
              <div className="entry-act" role="cell">
                <IconButton icon="remove" tone="danger" label={`리뷰 ${i + 1} 삭제`}
                            disabled={rows.length === 1} onClick={() => removeRow(r.key)} />
              </div>
            </div>
          ))}
        </div>

        <div className="table-tools">
          <SecondaryButton icon="add" onClick={addRow} disabled={full}>리뷰 추가</SecondaryButton>
          <span className="row-count" aria-live="polite">
            {full && <span className="row-count-full">최대 개수에 도달했어요 · </span>}
            <strong>{rows.length}</strong> / {MAX_ROWS}개
          </span>
        </div>

        <p className="notice">
          <Icon name="lock" />
          <span>전화번호·이메일·주소·주문번호는 자동으로 가려진 뒤 AI에 전달되고, 가려진 내용만 저장돼요.</span>
        </p>
      </SectionCard>
    </>
  );
}
