// 여러 리뷰 붙여넣기: 텍스트 → 파서로 리뷰 단위 추출 → 미리보기에서 확인 후 등록
import { useState } from 'react';
import { parseReviewText } from '../../import/parsers/index.js';
import { MAX_BULK_ROWS, rowsFromParsed } from '../../import/rows.js';
import BulkPreview from '../BulkPreview.jsx';
import Icon from '../Icon.jsx';
import { FormInput, SecondaryButton } from '../ui.jsx';

const MAX_PASTE_CHARS = 100000;
const PLACEHOLDER = `예)
★★★★★ 2026.10.20
커피가 정말 맛있어요.

별점 3
배달이 조금 늦었어요.

4점 | 양이 많아요`;

export default function PastePanel({ store, platform, rows, setRows, toast, go }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [batchId, setBatchId] = useState(0);

  function extract() {
    const { parser, items, mode } = parseReviewText(text);
    if (!items.length) {
      setError('추출된 리뷰가 없습니다. 리뷰 사이를 빈 줄로 구분했는지 확인하십시오.');
      setRows([]);
      setInfo(null);
      return;
    }
    setError(null);
    const limited = items.slice(0, MAX_BULK_ROWS);
    setRows(rowsFromParsed(limited, platform));
    setBatchId((n) => n + 1);
    const modeLabel = { 'blank-line': '빈 줄 기준', line: '한 줄 = 리뷰 하나', 'rating-line': '별점 줄 기준(추정)' }[mode];
    setInfo(`${parser.label} · ${modeLabel} · ${items.length}건 추출${items.length > MAX_BULK_ROWS ? ` (최대 ${MAX_BULK_ROWS}건까지 표시)` : ''}`);
  }

  function reset() {
    setRows([]);
    setInfo(null);
  }

  return (
    <div className="import-panel">
      <FormInput id="pasteText" label="리뷰 텍스트" multiline rows={10} value={text} maxLength={MAX_PASTE_CHARS}
                 placeholder={PLACEHOLDER} error={error}
                 hint="리뷰 사이는 빈 줄로 구분합니다. 한 줄에 리뷰 하나씩 입력해도 됩니다. 별점 표기: ★★★★☆, 별점 4, 4점, 4/5"
                 onChange={(e) => { setText(e.target.value); if (error) setError(null); }} />
      <div className="import-actions">
        <SecondaryButton icon="analyze" onClick={extract} disabled={!text.trim()}>리뷰 추출</SecondaryButton>
        <SecondaryButton tone="neutral" onClick={() => { setText(''); reset(); setError(null); }} disabled={!text && !rows.length}>지우기</SecondaryButton>
        {info && <span className="hint">{info}</span>}
      </div>
      <p className="notice notice-info">
        <Icon name="info" />
        <span>플랫폼 전용 파서는 실제 복사 형식 확인 후 추가 예정입니다. 현재는 범용 파서로 추출하며, 확실하지 않은 별점은 비워 두므로 등록 전 미리보기에서 확인해야 합니다.</span>
      </p>
      <BulkPreview store={store} rows={rows} setRows={setRows} batchId={batchId} toast={toast} go={go} onReset={reset}
                   resetLabel="미리보기 닫기" />
    </div>
  );
}
