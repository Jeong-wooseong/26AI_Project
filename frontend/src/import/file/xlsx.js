// XLSX 읽기 (외부 라이브러리 없이 브라우저 기본 기능만 사용).
// XLSX = ZIP 묶음 안의 XML 파일들. ZIP 은 직접 읽고, 압축 해제는 DecompressionStream('deflate-raw'),
// XML 은 DOMParser 로 읽는다. 파일은 서버로 보내지 않고 브라우저 안에서만 처리한다.

const MAX_UNCOMPRESSED = 50 * 1024 * 1024; // 압축 폭탄 방지
const MAX_ENTRIES = 2000;

function u16(view, o) {
  return view.getUint16(o, true);
}
function u32(view, o) {
  return view.getUint32(o, true);
}

/** ZIP 중앙 디렉터리를 읽어 { 경로: 읽기 함수 } 를 만든다 */
function readZipDirectory(buffer) {
  const view = new DataView(buffer);
  const min = Math.max(0, buffer.byteLength - 65557);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= min; i--) {
    if (u32(view, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('XLSX 파일 구조를 읽을 수 없습니다.');
  const count = u16(view, eocd + 10);
  let offset = u32(view, eocd + 16);
  if (count > MAX_ENTRIES) throw new Error('XLSX 내부 파일 수가 너무 많습니다.');

  const entries = new Map();
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (u32(view, offset) !== 0x02014b50) throw new Error('XLSX 파일 구조가 손상되었습니다.');
    const method = u16(view, offset + 10);
    const compressedSize = u32(view, offset + 20);
    const size = u32(view, offset + 24);
    const nameLen = u16(view, offset + 28);
    const extraLen = u16(view, offset + 30);
    const commentLen = u16(view, offset + 32);
    const localOffset = u32(view, offset + 42);
    const name = decoder.decode(new Uint8Array(buffer, offset + 46, nameLen));
    entries.set(name, { method, compressedSize, size, localOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  const total = [...entries.values()].reduce((s, e) => s + e.size, 0);
  if (total > MAX_UNCOMPRESSED) throw new Error('XLSX 압축을 풀면 너무 큽니다 (최대 50MB).');
  return { view, entries };
}

async function readEntry(buffer, zip, name) {
  const entry = zip.entries.get(name);
  if (!entry) return null;
  const { view } = zip;
  if (u32(view, entry.localOffset) !== 0x04034b50) throw new Error('XLSX 파일 구조가 손상되었습니다.');
  const start = entry.localOffset + 30 + u16(view, entry.localOffset + 26) + u16(view, entry.localOffset + 28);
  const data = new Uint8Array(buffer, start, entry.compressedSize);
  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) throw new Error('지원하지 않는 XLSX 압축 방식입니다.');
  if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 XLSX 읽기를 지원하지 않습니다. CSV 로 저장해 가져오십시오.');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

function xml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XLSX 내부 XML 을 읽을 수 없습니다.');
  return doc;
}
const all = (node, local) => [...node.getElementsByTagNameNS('*', local)];
const attr = (el, name) => el.getAttribute(name) ?? el.getAttributeNS?.('http://schemas.openxmlformats.org/officeDocument/2006/relationships', name.split(':').pop());

/** 'C12' → 2 (0부터) */
function columnIndex(ref) {
  const letters = /^[A-Z]+/.exec(ref ?? '')?.[0];
  if (!letters) return null;
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const textOf = (el) => all(el, 't').map((t) => t.textContent).join('');

/** 시트 목록 [{ name, path }] */
async function listSheets(buffer, zip) {
  const wb = xml(await readEntry(buffer, zip, 'xl/workbook.xml'));
  const relsText = await readEntry(buffer, zip, 'xl/_rels/workbook.xml.rels');
  const rels = new Map(relsText ? all(xml(relsText), 'Relationship').map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]) : []);
  return all(wb, 'sheet').map((s, i) => {
    const rid = s.getAttribute('r:id') ?? attr(s, 'r:id');
    let target = rels.get(rid) ?? `worksheets/sheet${i + 1}.xml`;
    target = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    return { name: s.getAttribute('name') ?? `Sheet${i + 1}`, path: target.replace(/\/\.\//g, '/') };
  });
}

/** 시트 하나를 2차원 배열로. 숫자 셀은 number, 나머지는 string */
async function readSheet(buffer, zip, path, sharedStrings) {
  const text = await readEntry(buffer, zip, path);
  if (!text) throw new Error('시트를 찾을 수 없습니다.');
  const doc = xml(text);
  const rows = [];
  for (const rowEl of all(doc, 'row')) {
    const rowNo = Number(rowEl.getAttribute('r')) || rows.length + 1;
    const row = [];
    let col = 0;
    for (const c of all(rowEl, 'c')) {
      const idx = columnIndex(c.getAttribute('r')) ?? col;
      const type = c.getAttribute('t');
      const v = all(c, 'v')[0]?.textContent ?? '';
      let value;
      if (type === 's') value = sharedStrings[Number(v)] ?? '';
      else if (type === 'inlineStr') value = textOf(c);
      else if (type === 'str' || type === 'e') value = v;
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
      else value = v === '' ? '' : Number(v);
      row[idx] = value;
      col = idx + 1;
    }
    rows[rowNo - 1] = Array.from(row, (x) => x ?? '');
  }
  return Array.from(rows, (r) => r ?? []).filter((r) => r.some((c) => String(c).trim() !== ''));
}

/** @returns {Promise<{ sheets: string[], read(index): Promise<any[][]> }>} */
export async function openXlsx(buffer) {
  const zip = readZipDirectory(buffer);
  if (!zip.entries.has('xl/workbook.xml')) throw new Error('엑셀 통합 문서(XLSX)가 아닙니다.');
  const sst = await readEntry(buffer, zip, 'xl/sharedStrings.xml');
  const sharedStrings = sst ? all(xml(sst), 'si').map(textOf) : [];
  const sheets = await listSheets(buffer, zip);
  if (!sheets.length) throw new Error('시트가 없습니다.');
  return {
    sheets: sheets.map((s) => s.name),
    read: (index) => readSheet(buffer, zip, sheets[index].path, sharedStrings),
  };
}
