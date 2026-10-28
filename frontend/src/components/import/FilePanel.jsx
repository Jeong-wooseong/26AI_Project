// 파일 가져오기: CSV·XLSX → 열 연결 → 검증·미리보기 → 등록. 파일은 브라우저 안에서만 읽는다.
import { useRef, useState } from 'react';
import { FIELDS, guessMapping } from '../../import/columns.js';
import { ACCEPT, MAX_FILE_BYTES, openTableFile } from '../../import/file/readFile.js';
import { MAX_BULK_ROWS, rowsFromTable } from '../../import/rows.js';
import BulkPreview from '../BulkPreview.jsx';
import Icon from '../Icon.jsx';
import { Alert, FormSelect, SecondaryButton } from '../ui.jsx';

const TEMPLATE = '플랫폼,별점,리뷰 내용,작성일,작성자\r\n배달의민족,5,커피가 정말 맛있어요,2026-10-20,\r\n';

function downloadTemplate() {
  // 엑셀이 한글을 깨지 않도록 UTF-8 BOM 을 붙인다
  const blob = new Blob(['﻿', TEMPLATE], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'replyboss_리뷰_양식.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const colName = (i) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

export default function FilePanel({ store, platform, rows, setRows, toast, go }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null); // { name, kind, encoding, sheets, readSheet }
  const [sheet, setSheet] = useState(0);
  const [table, setTable] = useState([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [batchId, setBatchId] = useState(0);

  async function loadSheet(opened, index) {
    const data = await opened.readSheet(index);
    setTable(data);
    setMapping(guessMapping(data[0] ?? []));
    setHasHeader(true);
  }

  async function onFile(f) {
    if (!f) return;
    setError(null);
    setNotice(null);
    setRows([]);
    try {
      const opened = await openTableFile(f);
      setFile({ name: f.name, ...opened });
      setSheet(0);
      await loadSheet(opened, 0);
    } catch (e) {
      setFile(null);
      setTable([]);
      setMapping(null);
      setError(e.message);
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function changeSheet(i) {
    setSheet(i);
    setRows([]);
    try {
      await loadSheet(file, i);
    } catch (e) {
      setError(e.message);
    }
  }

  function buildPreview() {
    if (mapping.rating < 0) {
      setError('별점 열을 선택하십시오 (필수).');
      return;
    }
    setError(null);
    const data = hasHeader ? table.slice(1) : table;
    const built = rowsFromTable(data.slice(0, MAX_BULK_ROWS * 2), mapping, { defaultPlatform: platform, firstRowNumber: hasHeader ? 2 : 1 });
    if (!built.length) {
      setError('가져올 행이 없습니다.');
      return;
    }
    setNotice(built.length > MAX_BULK_ROWS
      ? `행이 ${MAX_BULK_ROWS}개를 넘어 앞의 ${MAX_BULK_ROWS}행만 가져왔습니다. 나머지는 파일을 나눠 가져오십시오.`
      : null);
    setRows(built.slice(0, MAX_BULK_ROWS));
    setBatchId((n) => n + 1);
  }

  const width = Math.max(0, ...table.slice(0, 50).map((r) => r.length));
  const header = table[0] ?? [];
  const columnOptions = [[-1, '사용 안 함'], ...Array.from({ length: width }, (_, i) => [i, hasHeader && String(header[i] ?? '').trim()
    ? `${colName(i)}열 · ${String(header[i]).trim().slice(0, 20)}`
    : `${colName(i)}열`])];

  return (
    <div className="import-panel">
      <label
        className={`dropzone ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files?.[0]); }}
      >
        <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        <Icon name="upload" size={20} />
        <span className="dropzone-title">CSV 또는 XLSX 파일 선택</span>
        <span className="hint">클릭하거나 파일을 끌어다 놓습니다 · 최대 {MAX_FILE_BYTES / 1024 / 1024}MB, {MAX_BULK_ROWS}행 · 파일은 서버에 업로드되지 않습니다</span>
      </label>
      <div className="import-actions">
        <SecondaryButton tone="neutral" size="sm" icon="download" onClick={downloadTemplate}>양식 받기 (CSV)</SecondaryButton>
        <span className="hint">필수 열: 별점 · 선택 열: 리뷰 내용, 플랫폼, 작성일, 작성자</span>
      </div>

      {error && <Alert>{error}</Alert>}

      {file && mapping && (
        <div className="mapping">
          <div className="mapping-file">
            <Icon name="file" />
            <strong>{file.name}</strong>
            <span className="hint">
              {file.kind.toUpperCase()}{file.encoding ? ` · ${file.encoding}` : ''} · {Math.max(0, table.length - (hasHeader ? 1 : 0))}행
            </span>
          </div>
          <div className="mapping-options">
            {file.sheets.length > 1 && (
              <FormSelect id="sheet" label="시트" value={sheet} options={file.sheets.map((n, i) => [i, n])}
                          onChange={(e) => changeSheet(Number(e.target.value))} />
            )}
            <label className="check">
              <input type="checkbox" checked={hasHeader} onChange={(e) => { setHasHeader(e.target.checked); setRows([]); }} />
              첫 행은 머리글
            </label>
          </div>
          <div className="mapping-grid">
            {FIELDS.map((f) => (
              <FormSelect key={f.key} id={`map-${f.key}`} label={`${f.label}${f.required ? ' (필수)' : ''}`}
                          value={mapping[f.key]} options={columnOptions}
                          error={f.required && mapping[f.key] < 0 ? '열 선택 필요' : null}
                          onChange={(e) => { setMapping({ ...mapping, [f.key]: Number(e.target.value) }); setRows([]); }} />
            ))}
          </div>
          <p className="hint">플랫폼 열이 없거나 비어 있으면 위에서 선택한 리뷰 출처를 사용합니다. 작성자는 확인용으로만 표시하며 저장하지 않습니다.</p>
          <div className="import-actions">
            <SecondaryButton icon="analyze" onClick={buildPreview}>검증 및 미리보기</SecondaryButton>
          </div>
        </div>
      )}

      {notice && <p className="notice notice-info"><Icon name="info" /><span>{notice}</span></p>}

      <BulkPreview store={store} rows={rows} setRows={setRows} batchId={batchId} toast={toast} go={go}
                   onReset={() => setRows([])} resetLabel="미리보기 닫기" />
    </div>
  );
}
