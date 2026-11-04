// 답글 품질 피드백: 마음에 들어요 / 개선하고 싶어요(+ 이유). 프롬프트 개선 자료로 모은다.
import { useState } from 'react';
import { api } from '../../api.js';
import Icon from '../Icon.jsx';

export const FEEDBACK_REASONS = [
  ['CONTENT_MISMATCH', '리뷰 내용과 맞지 않음'],
  ['AWKWARD_TONE', '말투가 어색함'],
  ['WRONG_FACT', '사실과 다른 내용'],
  ['LENGTH', '너무 길거나 짧음'],
  ['OTHER', '기타'],
];

export default function ReplyFeedback({ reply, toast }) {
  const [value, setValue] = useState(reply.feedback ?? null);
  const [reasons, setReasons] = useState(reply.feedbackReasons ?? []);
  const [comment, setComment] = useState('');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send(next, nextReasons = [], nextComment = '') {
    setBusy(true);
    try {
      const r = await api.replyFeedback(reply.id, next, nextReasons, nextComment);
      setValue(r.feedback ?? null);
      setReasons(r.feedbackReasons ?? []);
      setAsking(false);
      if (next) toast?.show('의견을 보냈습니다. 답글 품질 개선에 쓰입니다.');
    } catch (e) {
      toast?.show(e.message);
    } finally {
      setBusy(false);
    }
  }

  function clickUp() {
    send(value === 'UP' ? null : 'UP');
  }

  function clickDown() {
    if (value === 'DOWN' && !asking) {
      send(null);
      return;
    }
    setAsking((v) => !v);
  }

  const toggle = (key) => setReasons((rs) => (rs.includes(key) ? rs.filter((x) => x !== key) : [...rs, key]));

  return (
    <div className="feedback">
      <div className="feedback-buttons" role="group" aria-label="이 답글에 대한 의견">
        <button type="button" className="act-btn" aria-pressed={value === 'UP'} disabled={busy} onClick={clickUp}>
          <Icon name="like" size={16} />
          마음에 들어요
        </button>
        <button type="button" className="act-btn" aria-pressed={value === 'DOWN'} aria-expanded={asking} disabled={busy}
                onClick={clickDown}>
          <Icon name="dislike" size={16} />
          개선하고 싶어요
        </button>
      </div>
      {asking && (
        <div className="feedback-form">
          <p className="hint">어떤 점이 아쉬웠나요? (여러 개 선택 가능)</p>
          <div className="feedback-reasons">
            {FEEDBACK_REASONS.map(([key, label]) => (
              <label key={key} className={`chip ${reasons.includes(key) ? 'is-on' : ''}`}>
                <input type="checkbox" className="sr-only" checked={reasons.includes(key)} onChange={() => toggle(key)} />
                {label}
              </label>
            ))}
          </div>
          <input className="input input-sm" value={comment} maxLength={300} placeholder="덧붙일 말 (선택)"
                 aria-label="덧붙일 말" onChange={(e) => setComment(e.target.value)} />
          <div className="end">
            <button type="button" className="act-btn" onClick={() => setAsking(false)} disabled={busy}>취소</button>
            <button type="button" className="act-btn is-primary" disabled={busy || reasons.length === 0}
                    onClick={() => send('DOWN', reasons, comment.trim())}>
              보내기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
