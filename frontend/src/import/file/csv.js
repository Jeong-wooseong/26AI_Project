// CSV 읽기 (RFC 4180: 따옴표, 따옴표 안 줄바꿈, "" 이스케이프).
// 엑셀에서 저장한 한글 CSV 는 CP949(EUC-KR)인 경우가 많아 UTF-8 로 읽히지 않으면 EUC-KR 로 다시 읽는다.

export function decodeText(buffer) {
  const bytes = new Uint8Array(buffer);
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, ''), encoding: 'UTF-8' };
  } catch {
    return { text: new TextDecoder('euc-kr').decode(bytes), encoding: 'EUC-KR' };
  }
}

/** 첫 줄에서 따옴표 밖의 구분자 개수로 쉼표·세미콜론·탭 중 하나를 고른다 */
function detectDelimiter(text) {
  const firstLine = [];
  let inQuotes = false;
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === '\n' || ch === '\r')) break;
    if (!inQuotes) firstLine.push(ch);
  }
  const counts = { ',': 0, ';': 0, '\t': 0 };
  for (const ch of firstLine) if (ch in counts) counts[ch]++;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    : ',';
}

export function parseCsv(text) {
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return { rows: rows.filter((r) => r.some((c) => c.trim() !== '')), delimiter };
}
