import { useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import { FormInput, PrimaryButton, SecondaryButton } from '../ui.jsx';
import { ReplyText } from './ReplyTypingText.jsx';
import { selectTextOf, useCopy } from './useCopy.js';
import { STRATEGY_LABEL, TONE_LABEL, hasFillIn, textOf } from './replyModel.js';

/** 작성 완료한 최종 답글 하나: 리뷰 원문과 구분해 보여주고, 복사와 수정을 제공한다. */
export default function FinalReply({ reply, onSave, toast }) {
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

  return (
    <div className="final">
      <div className="final-head">
        <span className="final-label">최종 답글</span>
        <span className="final-tone">
          {TONE_LABEL[reply.tone] ?? reply.tone}
          {reply.strategy ? ` (${STRATEGY_LABEL[reply.strategy] ?? reply.strategy})` : ''}
          {reply.editedContent ? ', 직접 수정' : ''}
        </span>
        {!editing && (
          <div className="final-actions">
            <button type="button" className={`act-btn ${copied ? 'is-copied' : ''}`} onClick={copyFinal}
                    aria-label={copied ? '최종 답글 복사됨' : '최종 답글 복사'}>
              <Icon name={copied ? 'confirm' : 'copy'} size={16} />
              {copied ? '복사됨' : '복사'}
            </button>
            <button type="button" className="act-btn" onClick={startEdit} aria-label="최종 답글 수정">
              <Icon name="edit" size={16} />
              수정
            </button>
          </div>
        )}
      </div>
      {editing ? (
        <div className="rt-edit">
          <FormInput multiline aria-label="최종 답글 수정" value={draft} rows={4} autoFocus maxLength={2000}
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
  );
}
