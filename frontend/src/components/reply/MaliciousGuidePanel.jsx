import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import { FormInput, PrimaryButton, SecondaryButton } from '../ui.jsx';
import ReplyGenerationLoader from './ReplyGenerationLoader.jsx';
import { ReplyText } from './ReplyTypingText.jsx';
import { selectTextOf, useCopy } from './useCopy.js';
import { STRATEGIES, STRATEGY_LABEL, guideOf, hasFillIn, textOf } from './replyModel.js';

const GUIDE_STEPS = ['리뷰 내용 분석 중', '대응 전략 검토 중', '답글 초안 작성 중', '안전 규칙 검토 중'];
const GUIDE_NOTE = '추천 전략과 근거, 답글 초안을 만들고 있습니다. 응답이 오는 대로 표시합니다.';

/**
 * 악성 리뷰 대응 가이드: 전략(사과 후 마무리 / 사실 관계 설명 / 응대 보류·신고 검토), 근거, 확인할 것, 답글 초안.
 * 사장님 확인 체크 전에는 복사와 작성 완료를 막는다.
 * generation: { state: 'idle' | 'loading' | 'error', error? } — 요청 상태는 행(Ticket)이 가진다.
 */
export default function MaliciousGuidePanel({ review: r, generation, onGenerate, onComplete, toast }) {
  const guide = guideOf(r);
  const loading = generation.state === 'loading';
  const [text, setText] = useState(guide ? textOf(guide) : '');
  const [editing, setEditing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const { copiedKey, copy } = useCopy();
  const textRef = useRef(null);

  // 새 가이드를 받으면 문장·확인 상태를 새로 시작한다
  useEffect(() => {
    setText(guide ? textOf(guide) : '');
    setEditing(false);
    setConfirmed(false);
  }, [guide?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function copyGuide() {
    if (!confirmed) return;
    const ok = await copy(text, guide.id);
    if (!ok) {
      selectTextOf(textRef.current);
      toast.show('클립보드에 복사하지 못했습니다. 선택된 답글을 Ctrl+C로 복사하십시오.');
    } else if (hasFillIn(text)) {
      toast.show('복사했습니다. 채워야 할 [ ] 항목이 남아 있습니다.');
    }
  }

  async function complete() {
    if (!confirmed || saving) return;
    if (!text.trim()) {
      toast.show('답글 내용을 입력하십시오.');
      return;
    }
    setSaving(true);
    await onComplete(guide.id, text.trim(), true);
    setSaving(false);
  }

  const copied = guide && copiedKey === guide.id;

  return (
    <div className="rt-reply guide">
      <div className="reply-head">
        <span className="ai-label is-guide">
          <Icon name="guide" size={14} />
          악성 리뷰 대응 가이드
          <small>사장님 확인 필수</small>
        </span>
      </div>

      {loading && <ReplyGenerationLoader steps={GUIDE_STEPS} note={GUIDE_NOTE} />}

      {generation.state === 'error' && (
        <div className="gen-error" role="alert">
          <p>
            {generation.error.message}
            <span className="error-code">오류 코드 {generation.error.code}</span>
          </p>
          <SecondaryButton tone="neutral" size="sm" icon="retry" onClick={() => onGenerate(generation.strategy)}>다시 시도</SecondaryButton>
        </div>
      )}

      {!guide && !loading && generation.state !== 'error' && (
        <div className="reply-empty">
          <SecondaryButton size="sm" icon="guide" onClick={() => onGenerate(null)}>대응 가이드 받기</SecondaryButton>
          <span className="hint">즉시 답글보다 대응 방향을 먼저 정하도록 전략, 근거, 답글 초안을 만듭니다.</span>
        </div>
      )}

      {guide && !loading && (
        <div className="guide-body">
          <fieldset className="guide-strategies">
            <legend>대응 전략</legend>
            <div className="guide-options">
              {STRATEGIES.map(([key, label]) => (
                <label key={key} className={`guide-option ${guide.strategy === key ? 'is-current' : ''}`}>
                  <input type="radio" name={`strategy-${r.id}`} checked={guide.strategy === key}
                         onChange={() => onGenerate(key)} />
                  {label}
                </label>
              ))}
            </div>
            <p className="hint">다른 전략을 고르면 그 전략으로 근거와 답글을 다시 만듭니다.</p>
          </fieldset>

          <dl className="guide-facts">
            <div>
              <dt>{STRATEGY_LABEL[guide.strategy] ?? guide.strategy}: 근거</dt>
              <dd>{guide.strategyReason}</dd>
            </div>
            {guide.checklist?.length > 0 && (
              <div>
                <dt>답글 전에 확인할 것</dt>
                <dd>
                  <ul className="guide-checklist">
                    {guide.checklist.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </dd>
              </div>
            )}
          </dl>

          {guide.strategy === 'HOLD' && (
            <p className="guide-hold">
              <Icon name="info" size={16} />
              바로 답글을 달기보다 해당 플랫폼의 리뷰 신고·게시 중단 기준을 먼저 확인하십시오. 아래 답글은 필요할 때만 사용합니다.
            </p>
          )}

          <div className="guide-reply">
            <div className="final-head">
              <span className="draft-tone">대응 답글 초안</span>
              <div className="final-actions">
                <button type="button" className="act-btn" aria-pressed={editing} onClick={() => setEditing(!editing)}>
                  <Icon name={editing ? 'confirm' : 'edit'} size={16} />
                  {editing ? '수정 완료' : '수정'}
                </button>
                <button type="button" className={`act-btn ${copied ? 'is-copied' : ''}`} onClick={copyGuide}
                        disabled={!confirmed} title={confirmed ? undefined : '사장님 확인 후 복사할 수 있습니다'}
                        aria-label={copied ? '대응 답글 복사됨' : '대응 답글 복사'}>
                  <Icon name={copied ? 'confirm' : 'copy'} size={16} />
                  {copied ? '복사됨' : '복사'}
                </button>
              </div>
            </div>
            {editing ? (
              <FormInput multiline aria-label="대응 답글 수정" value={text} rows={4} autoFocus maxLength={2000}
                         onChange={(e) => setText(e.target.value)} />
            ) : (
              <p ref={textRef} className="ai-text"><ReplyText text={text} /></p>
            )}
          </div>

          <div className="draft-foot">
            <label className="guide-confirm">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              전략과 답글 내용을 확인했습니다. 답글 사용 여부는 사장님이 판단합니다.
            </label>
            <PrimaryButton size="sm" icon="confirm" onClick={complete} disabled={!confirmed} loading={saving} loadingText="저장 중">
              작성 완료
            </PrimaryButton>
          </div>
        </div>
      )}
    </div>
  );
}
