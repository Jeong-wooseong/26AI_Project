import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import { FormInput, PrimaryButton, SecondaryButton } from '../ui.jsx';
import ReplyGenerationLoader from './ReplyGenerationLoader.jsx';
import ReplyTypingText from './ReplyTypingText.jsx';
import { selectTextOf, useCopy } from './useCopy.js';
import { DRAFT_TYPES, TONE_LABEL, draftsOf, hasFillIn, textOf } from './replyModel.js';

/**
 * 작성 대기 리뷰의 답글 영역: 초안 확인 → (필요하면 수정) → 하나 선택 → 작성 완료.
 *  - 복사는 클립보드에만 넣는다 (작성 완료로 바뀌지 않음).
 *  - 새로 생성한 초안만 세 개가 동시에 타이핑 효과로 나타나고, 다시 열 때는 바로 전체를 보여준다.
 *
 * generation: { state: 'idle' | 'loading' | 'error', error?, freshIds? } — 생성 요청 상태는 행(Ticket)이 가진다.
 */
export default function ReplyDraftPanel({ review: r, generation, onGenerate, onComplete, toast }) {
  const drafts = draftsOf(r);
  const canGenerate = DRAFT_TYPES.includes(r.type) && r.status === 'CLASSIFIED';
  const loading = generation.state === 'loading';
  const [selectedId, setSelectedId] = useState(() => (drafts.length === 1 ? drafts[0].id : null));
  const [texts, setTexts] = useState({}); // 답글 id → 수정한 문장
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const { copiedKey, copy } = useCopy();
  const textRefs = useRef({});

  // 타이핑 효과: 이번 생성 요청으로 새로 받은 초안만, 모두 동시에 시작
  const order = useMemo(() => (generation.freshIds ?? []).filter((id) => drafts.some((d) => d.id === id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [generation.freshIds]);
  // 타이핑을 마쳤거나 사용자가 펼친 초안 (전체 표시)
  const [revealed, setRevealed] = useState(() => new Set());
  useEffect(() => {
    setRevealed(new Set());
    setTexts({});
    setEditingId(null);
    setSelectedId((id) => (drafts.some((d) => d.id === id) ? id : drafts.length === 1 ? drafts[0].id : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  const modeOf = (id) => (order.includes(id) && !revealed.has(id) ? 'typing' : 'full');
  // 타이핑이 끝나거나, 수정·선택·복사하면 그 초안은 애니메이션을 멈추고 전체를 보여준다
  const reveal = (id) => setRevealed((s) => (s.has(id) ? s : new Set(s).add(id)));

  const textFor = (d) => texts[d.id] ?? textOf(d);
  const selected = drafts.find((d) => d.id === selectedId) ?? null;

  function select(id) {
    reveal(id);
    setSelectedId(id);
  }

  function toggleEdit(d) {
    reveal(d.id);
    setSelectedId(d.id); // 고치는 초안을 최종 후보로
    setEditingId((id) => (id === d.id ? null : d.id));
  }

  async function copyDraft(d) {
    reveal(d.id);
    const text = textFor(d);
    const ok = await copy(text, d.id);
    if (!ok) {
      selectTextOf(textRefs.current[d.id]);
      toast.show('클립보드에 복사하지 못했습니다. 선택된 답글을 Ctrl+C로 복사하십시오.');
    } else if (hasFillIn(text)) {
      toast.show('복사했습니다. 채워야 할 [ ] 항목이 남아 있습니다.');
    }
  }

  async function complete() {
    if (!selected || saving) return;
    const text = textFor(selected).trim();
    if (!text) {
      toast.show('답글 내용을 입력하십시오.');
      return;
    }
    setSaving(true);
    const ok = await onComplete(selected.id, text);
    setSaving(false);
    if (ok && hasFillIn(text)) toast.show('작성 완료로 저장했습니다. 채워야 할 [ ] 항목이 남아 있습니다.');
  }

  const showList = drafts.length > 0 && !loading;

  return (
    <div className="rt-reply">
      <div className="reply-head">
        <span className="ai-label">
          AI 답글 초안
          <small>{showList ? '최종 답글로 쓸 초안을 고른 뒤 작성 완료를 누르십시오.' : '매장 답글 스타일과 리뷰 키워드를 반영합니다.'}</small>
        </span>
        {canGenerate && drafts.length > 0 && !loading && (
          <button type="button" className="text-btn" onClick={onGenerate}>다시 생성</button>
        )}
      </div>

      {loading && <ReplyGenerationLoader />}

      {generation.state === 'error' && (
        <div className="gen-error" role="alert">
          <p>
            {generation.error.message}
            <span className="error-code">오류 코드 {generation.error.code}</span>
          </p>
          <SecondaryButton tone="neutral" size="sm" icon="retry" onClick={onGenerate}>다시 시도</SecondaryButton>
        </div>
      )}

      {canGenerate && drafts.length === 0 && !loading && generation.state !== 'error' && (
        <div className="reply-empty">
          <SecondaryButton size="sm" icon="analyze" onClick={onGenerate}>답글 초안 생성</SecondaryButton>
          <span className="hint">정중형, 친근형, 간결형 3개를 만듭니다.</span>
        </div>
      )}

      {showList && (
        <>
          <div className="draft-list" role="radiogroup" aria-label="최종 답글로 쓸 초안">
            {drafts.map((d) => {
              const label = TONE_LABEL[d.tone] ?? d.tone;
              const text = textFor(d);
              const isSelected = d.id === selectedId;
              const editing = d.id === editingId;
              const copied = copiedKey === d.id;
              return (
                <div key={d.id} className={`draft-card ${isSelected ? 'is-selected' : ''}`}>
                  <label className="draft-pick">
                    <input type="radio" name={`final-${r.id}`} checked={isSelected} onChange={() => select(d.id)} />
                    <span className="draft-tone">{label}</span>
                    {texts[d.id] != null && texts[d.id] !== textOf(d) && <span className="draft-edited">수정함</span>}
                  </label>
                  <div className="draft-body" onClick={() => !editing && select(d.id)}>
                    {editing ? (
                      <FormInput multiline aria-label={`${label} 답글 수정`} value={text} rows={4} autoFocus maxLength={2000}
                                 onChange={(e) => setTexts((t) => ({ ...t, [d.id]: e.target.value }))} />
                    ) : (
                      <ReplyTypingText ref={(el) => { textRefs.current[d.id] = el; }} text={text} mode={modeOf(d.id)}
                                       onDone={() => reveal(d.id)} />
                    )}
                  </div>
                  <div className="draft-actions">
                    <button type="button" className="act-btn" aria-pressed={editing} onClick={() => toggleEdit(d)}>
                      <Icon name={editing ? 'confirm' : 'edit'} size={16} />
                      {editing ? '수정 완료' : '수정'}
                    </button>
                    <button type="button" className={`act-btn ${copied ? 'is-copied' : ''}`} onClick={() => copyDraft(d)}
                            aria-label={copied ? `${label} 복사됨` : `${label} 복사`}>
                      <Icon name={copied ? 'confirm' : 'copy'} size={16} />
                      {copied ? '복사됨' : '복사'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="draft-foot">
            <p className="hint" aria-live="polite">
              {selected
                ? `${TONE_LABEL[selected.tone] ?? selected.tone} 답글을 최종 답글로 저장합니다.`
                : '최종 답글로 쓸 초안을 선택하십시오.'}
              {' '}배달앱·지도에는 자동으로 게시되지 않습니다.
            </p>
            <PrimaryButton size="sm" icon="confirm" onClick={complete} disabled={!selected} loading={saving} loadingText="저장 중">
              작성 완료
            </PrimaryButton>
          </div>
        </>
      )}
    </div>
  );
}
