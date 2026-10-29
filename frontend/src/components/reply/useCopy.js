import { useCallback, useEffect, useRef, useState } from 'react';

const FEEDBACK_MS = 1600;

/** 클립보드 API 가 막힌 환경(HTTP, 권한 거부)용 대체 복사 */
function legacyCopy(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(area);
  return ok;
}

/**
 * 복사 + 잠깐 동안의 '복사됨' 표시. 복사는 상태(작성 완료)를 바꾸지 않는다.
 * @returns {{ copiedKey: any, copy: (text: string, key: any) => Promise<boolean> }}
 */
export function useCopy() {
  const [copiedKey, setCopiedKey] = useState(null);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async (text, key) => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = legacyCopy(text);
    }
    if (ok) {
      setCopiedKey(key);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopiedKey(null), FEEDBACK_MS);
    }
    return ok;
  }, []);

  return { copiedKey, copy };
}

/** 복사에 실패했을 때: 답글 문장을 선택해 두어 Ctrl+C 로 바로 복사할 수 있게 한다 */
export function selectTextOf(element) {
  if (!element) return;
  const selection = window.getSelection();
  selection.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.addRange(range);
}
