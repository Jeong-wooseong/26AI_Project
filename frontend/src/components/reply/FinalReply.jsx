import { useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import Mascot from '../Mascot.jsx';
import { FormInput, PrimaryButton, SecondaryButton } from '../ui.jsx';
import { ReplyText } from './ReplyTypingText.jsx';
import { selectTextOf, useCopy } from './useCopy.js';
import ReplyFeedback from './ReplyFeedback.jsx';
import { STRATEGY_LABEL, TONE_LABEL, hasFillIn, textOf } from './replyModel.js';

/** 작성 완료한 최종 답글 하나: 리뷰 원문과 구분해 보여주고, 복사와 수정을 제공한다. */
export default function FinalReply({ reply, onSave, toast, meta }) {
  const [open, setOpen] = useState(false); // 답글 다시 보기
  const [askFeedback, setAskFeedback] = useState(false); // 답글 품질 의견
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const { copiedKey, copy } = useCopy();
  const textRef = useRef(null);
  const text = textOf(reply);
  const copied = copiedKey === reply.id;

  async function copyFinal() {
    const ok = await copy(text, reply.id);
    if (!ok) {
      selectTextOf(textRef.current);
      toast.show('클립보드에 복사하지 못했습니다. 선택된 답글을 Ctrl+C로 복사하십시오.');
    } else if (hasFillIn(text)) {
      toast.show('복사했습니다. 채워야 할 [ ] 항목이 남아 있습니다.');
    }
  }

  function startEdit() {
    setDraft(text);
    setEditing(true);
    setOpen(true);
  }

  async function save() {
    const value = draft.trim();
    if (!value) {
      toast.show('답글 내용을 입력하십시오.');
      return;
    }
    if (value === text) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onSave(value);
    setSaving(false);
    if (ok) setEditing(false);
  }

  const toneText = `${TONE_LABEL[reply.tone] ?? reply.tone}${reply.strategy ? ` (${STRATEGY_LABEL[reply.strategy] ?? reply.strategy})` : ''}${reply.editedContent ? ', 직접 수정' : ''}`;

  return (
    <>
      <div className="reply-zone is-done">
        <div className="ai-title">
          <span className="ai-title-mascot"><Mascot pose="happy" size={34} /></span>
          <span>
            <small><Icon name="sparkles" size={13} />ReplyBoss AI</small>
            <strong>답글 초안</strong>
          </span>
        </div>

        <div className="final">
          <span className="final-icon" aria-hidden="true"><Icon name="confirm" size={22} /></span>
          <span className="final-title">
            <strong>답글 작성을 완료했어요</strong>
            <small>배달앱·지도에 실제로 올렸는지는 ReplyBoss에서 확인할 수 없습니다.</small>
          </span>
          <SecondaryButton aria-expanded={open} onClick={() => { setOpen((v) => !v); setEditing(false); }}>
            {open ? '답글 접기' : '답글 다시 보기'}
          </SecondaryButton>
        </div>

        {open && (
          <div className="final-reply">
            <div className="final-reply-head">
              <span className="section-label">최종 답글 <span className="final-tone">{toneText}</span></span>
              {!editing && (
                <div className="final-actions">
                  <SecondaryButton size="sm" icon={copied ? 'confirm' : 'copy'} className={copied ? 'is-copied' : undefined} onClick={copyFinal}
                                   aria-label={copied ? '최종 답글 복사됨' : '최종 답글 복사'}>
                    {copied ? '복사됨' : '복사'}
                  </SecondaryButton>
                  <SecondaryButton tone="neutral" size="sm" icon="edit" onClick={startEdit} aria-label="최종 답글 수정">수정</SecondaryButton>
                </div>
              )}
            </div>
            {editing ? (
              <div className="rt-edit">
                <FormInput multiline aria-label="최종 답글 수정" value={draft} rows={5} autoFocus maxLength={2000}
                           onChange={(e) => setDraft(e.target.value)} />
                <div className="end">
                  <SecondaryButton tone="neutral" size="sm" onClick={() => setEditing(false)} disabled={saving}>취소</SecondaryButton>
                  <PrimaryButton size="sm" icon="save" onClick={save} loading={saving} loadingText="저장 중">저장</PrimaryButton>
                </div>
              </div>
            ) : (
              <p ref={textRef} className="final-text"><ReplyText text={text} /></p>
            )}
          </div>
        )}

        {askFeedback && (
          <div className="final-feedback">
            <span className="section-label">이 답글은 어땠나요?</span>
            <ReplyFeedback reply={reply} toast={toast} />
          </div>
        )}
      </div>

      <footer className="detail-foot">
        <span><Icon name="clock" size={15} />{meta}</span>
        <button type="button" aria-expanded={askFeedback} onClick={() => setAskFeedback((v) => !v)}>
          <Icon name="send" size={15} />{reply.feedback ? '보낸 의견 보기' : '답글 품질 의견 보내기'}
        </button>
      </footer>
    </>
  );
}
