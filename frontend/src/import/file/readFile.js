// 업로드한 파일을 표(2차원 배열)로 읽는다. 파일은 브라우저 안에서만 읽고 서버에 올리지 않는다.
import { decodeText, parseCsv } from './csv.js';
import { openXlsx } from './xlsx.js';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ACCEPT = '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const isZip = (b) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

/**
 * @returns {Promise<{ kind: 'csv'|'xlsx', sheets: string[], readSheet(i): Promise<any[][]>, encoding?: string }>}
 */
export async function openTableFile(file) {
  const name = file.name.toLowerCase();
  if (file.size > MAX_FILE_BYTES) throw new Error('파일이 너무 큽니다 (최대 5MB).');
  if (file.size === 0) throw new Error('빈 파일입니다.');
  const buffer = await file.arrayBuffer();
  const head = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));

  if (name.endsWith('.xlsx')) {
    if (!isZip(head)) throw new Error('XLSX 형식이 아닙니다. 파일을 엑셀에서 다시 저장하십시오.');
    const book = await openXlsx(buffer);
    return { kind: 'xlsx', sheets: book.sheets, readSheet: (i) => book.read(i) };
  }
  if (name.endsWith('.csv')) {
    if (isZip(head)) throw new Error('확장자는 CSV 이지만 내용은 엑셀 파일입니다. .xlsx 로 저장해 가져오십시오.');
    const { text, encoding } = decodeText(buffer);
    if (text.includes('\u0000')) throw new Error('텍스트 CSV 파일이 아닙니다.');
    const { rows } = parseCsv(text);
    return { kind: 'csv', encoding, sheets: [], readSheet: async () => rows };
  }
  if (name.endsWith('.xls')) throw new Error('예전 엑셀 형식(.xls)은 지원하지 않습니다. .xlsx 또는 .csv 로 저장하십시오.');
  throw new Error('CSV 또는 XLSX 파일만 가져올 수 있습니다.');
}
