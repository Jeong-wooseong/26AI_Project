import { forwardRef, useEffect, useState } from 'react';
import { FILL_IN } from './replyModel.js';

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** 답글 문장. [ ] 로 감싼 '채울 자리'는 눈에 띄게 표시한다. */
export function ReplyText({ text }) {
  return text.split(FILL_IN).map((part, i) => (part.startsWith('[') && part.endsWith(']')
    ? <mark key={i} className="fill-in">{part}</mark>
    : part));
}

/** 글자 수에 비례하되 너무 짧거나 길지 않게 (한 초안당 0.5~1.4초) */
const durationOf = (length) => Math.min(1400, Math.max(500, length * 16));

/**
 * 생성이 끝난 답글을 화면에서 순서대로 보여주는 시각 효과 (스트리밍 응답이 아님).
 * mode: 'full'(전체 표시) | 'typing'(입력되는 중) | 'waiting'(차례를 기다리는 중, 자리만 차지)
 * 레이아웃이 흔들리지 않도록 전체 문장을 보이지 않게 깔아 높이를 미리 잡는다.
 */
const ReplyTypingText = forwardRef(function ReplyTypingText({ text, mode = 'full', onDone, className = '' }, ref) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (mode !== 'typing') return undefined;
    if (prefersReducedMotion()) {
      onDone?.();
      return undefined;
    }
    const duration = durationOf(text.length);
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const n = Math.min(text.length, Math.ceil((text.length * (now - start)) / duration));
      setCount(n);
      if (n < text.length) frame = requestAnimationFrame(tick);
      else onDone?.();
    };
    setCount(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, text]);

  if (mode === 'full') {
    return <p ref={ref} className={`ai-text ${className}`}><ReplyText text={text} /></p>;
  }
  return (
    <p ref={ref} className={`ai-text is-typing ${className}`}>
      <span className="sr-only">{text}</span>
      <span className="type-ghost" aria-hidden="true">{text}</span>
      <span className="type-live" aria-hidden="true">
        {mode === 'typing' && text.slice(0, count)}
        {mode === 'typing' && <span className="type-caret" />}
      </span>
    </p>
  );
});

export default ReplyTypingText;
