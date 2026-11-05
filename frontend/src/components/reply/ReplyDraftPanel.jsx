import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import Mascot from '../Mascot.jsx';
import { PrimaryButton, SecondaryButton } from '../ui.jsx';
import ReplyGenerationLoader from './ReplyGenerationLoader.jsx';
import ReplyTypingText from './ReplyTypingText.jsx';
import { useCopy } from './useCopy.js';
import { DRAFT_TYPES, SIMILAR_THRESHOLD, TONE_LABEL, draftsOf, hasFillIn, textOf } from './replyModel.js';
import ReplyFeedback from './ReplyFeedback.jsx';

/**
 * 작성 대기 리뷰의 답글 작업: 말투 탭(정중형·친근형·간결형)으로 초안을 고르고, 편집기에서 바로 고친 뒤 작성 완료.
 *  - 복사는 클립보드에만 넣는다 (작성 완료로 바뀌지 않음).
 *  - 새로 만든 초안은 지금 보고 있는 탭만 입력되는 효과로 보여주고, 다른 탭은 고르면 바로 전체를 보여준다.
 *
 * generation: { state: 'idle' | 'loading' | 'error', error?, freshIds? } — 생성 요청 상태는 리뷰(Ticket)가 가진다.
 */
export default function ReplyDraftPanel({ review: r, generation, onGenerate, onComplete, toast }) {
  const drafts = draftsOf(r);
  const canGenerate = DRAFT_TYPES.includes(r.type) && r.status === 'CLASSIFIED';
  const loading = generation.state === 'loading';
  const [selectedId, setSelectedId] = useState(() => drafts[0]?.id ?? null);
  const [texts, setTexts] = useState({}); // 답글 id → 고친 문장
  const [saving, setSaving] = useState(false);
  const { copiedKey, copy } = useCopy();
  const editorRef = useRef(null);

  const fresh = useMemo(() => (generation.freshIds ?? []).filter((id) => drafts.some((d) => d.id === id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [generation.freshIds]);
  const [revealed, setRevealed] = useState(() => new Set());
  // 새로 만들면 고친 문장을 비우고 첫 초안부터 보여준다
  useEffect(() => {
    setRevealed(new Set());
    setTexts({});
    setSelectedId((id) => (drafts.some((d) => d.id === id) && !fresh.length ? id : drafts[0]?.id ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh, drafts.length]);

  const selected = drafts.find((d) => d.id === selectedId) ?? drafts[0] ?? null;
  const reveal = (id) => setRevealed((s) => (s.has(id) ? s : new Set(s).add(id)));
  const typing = selected && fresh.includes(selected.id) && !revealed.has(selected.id);
  const textFor = (d) => texts[d.id] ?? textOf(d);
  const text = selected ? textFor(selected) : '';
  const edited = (d) => texts[d.id] != null && texts[d.id] !== textOf(d);
  const similar = (d) => d.maxSimilarity != null && d.maxSimilarity >= SIMILAR_THRESHOLD;

  function pick(id) {
    if (selected) reveal(selected.id);
    reveal(id);
    setSelectedId(id);
  }

  async function copyDraft() {
    reveal(selected.id);
    const ok = await copy(text, selected.id);
    if (!ok) {
      editorRef.current?.select();
      toast.show('클립보드에 복사하지 못했습니다. 선택된 답글을 Ctrl+C로 복사하십시오.');
    } else if (hasFillIn(text)) {
      toast.show('복사했습니다. 채워야 할 [ ] 항목이 남아 있습니다.');
    }
  }

  async function complete() {
    if (!selected || saving) return;
    const value = text.trim();
    if (!value) {
      toast.show('답글 내용을 입력하십시오.');
      return;
    }
    setSaving(true);
    const ok = await onComplete(selected.id, value);
    setSaving(false);
    if (ok && hasFillIn(value)) toast.show('작성 완료로 저장했습니다. 채워야 할 [ ] 항목이 남아 있습니다.');
  }

  const showDrafts = drafts.length > 0 && !loading;
  // 중복 방지: 이전 답글과 비슷해 다시 만든 횟수 (같은 요청으로 만든 초안은 횟수가 같음)
  const regenerations = Math.max(0, ...drafts.map((d) => d.regenCount ?? 0));
  const copied = selected && copiedKey === selected.id;

  return (
    <div className="reply-zone">
      <div className="ai-title">
        <span className="ai-title-mascot"><Mascot pose={loading ? 'writing' : 'smile'} size={34} /></span>
        <span>
          <small><Icon name="sparkles" size={13} />ReplyBoss AI</small>
          <strong>답글 초안</strong>
        </span>
        {showDrafts && <span className="ai-title-note">매장 답글 스타일과 리뷰 키워드를 반영했어요</span>}
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
          <PrimaryButton icon="analyze" onClick={onGenerate}>답글 초안 생성</PrimaryButton>
          <span className="hint">정중형, 친근형, 간결형 3개를 만듭니다. 매장 말투와 리뷰 키워드를 반영합니다.</span>
        </div>
      )}

      {showDrafts && selected && (
        <>
          {drafts.length > 1 && (
            <div className="tone-tabs" role="radiogroup" aria-label="최종 답글로 쓸 초안">
              {drafts.map((d) => (
                <button key={d.id} type="button" role="radio" aria-checked={d.id === selected.id} className="tone-tab"
                        onClick={() => pick(d.id)}>
                  {TONE_LABEL[d.tone] ?? d.tone}
                  {edited(d) && <span className="tone-tab-mark">수정함</span>}
                  {similar(d) && <span className="tone-tab-mark is-warn">유사</span>}
                </button>
              ))}
            </div>
          )}

          <div className={`editor ${typing ? 'is-typing' : ''}`}>
            {typing ? (
              <button type="button" className="editor-typing" onClick={() => reveal(selected.id)} aria-label="초안 전체 보기">
                <ReplyTypingText text={text} mode="typing" onDone={() => reveal(selected.id)} />
              </button>
            ) : (
              <textarea ref={editorRef} className="editor-text" value={text} maxLength={2000} rows={5}
                        aria-label={`${TONE_LABEL[selected.tone] ?? selected.tone} 답글 (고칠 수 있음)`}
                        onChange={(e) => setTexts((t) => ({ ...t, [selected.id]: e.target.value }))} />
            )}
            <div className="editor-foot">
              <span>{text.length}자{edited(selected) ? ', 직접 고침' : ''}</span>
              {hasFillIn(text) && <span className="is-warn">[ ] 안을 채운 뒤 복사하십시오</span>}
            </div>
          </div>

          {similar(selected) && (
            <p className="similar-warning" role="note">
              <Icon name="error" size={18} />
              <span>
                <strong>최근 답글과 표현이 비슷해요</strong>
                이전 답글과 유사도 {selected.maxSimilarity.toFixed(2)}입니다. 같은 문구가 반복되지 않게 조금 고치거나 다시 생성하십시오.
              </span>
            </p>
          )}
          {regenerations > 0 && (
            <p className="hint regen-note">이전 답글과 겹치거나 작성 규칙을 어긴 초안이 있어 {regenerations}번 다시 만들었습니다.</p>
          )}

          <ReplyFeedback key={selected.id} reply={selected} toast={toast} />

          <div className="reply-actions">
            {canGenerate
              ? <SecondaryButton tone="neutral" icon="retry" onClick={onGenerate}>다시 생성</SecondaryButton>
              : <span />}
            <div className="reply-actions-end">
              <SecondaryButton icon={copied ? 'confirm' : 'copy'} className={copied ? 'is-copied' : undefined} onClick={copyDraft}>
                {copied ? '복사됨' : '답글 복사'}
              </SecondaryButton>
              <PrimaryButton icon="confirm" onClick={complete} loading={saving} loadingText="저장 중">작성 완료</PrimaryButton>
            </div>
          </div>
          <p className="copy-guidance">
            <Icon name="info" size={16} />
            작성 완료는 ReplyBoss에만 기록됩니다. 배달앱·지도에는 복사한 답글을 직접 붙여 넣으십시오.
          </p>
        </>
      )}
    </div>
  );
}
