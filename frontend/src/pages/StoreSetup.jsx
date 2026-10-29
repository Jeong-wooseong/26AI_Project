import { useRef, useState } from 'react';
import { api } from '../api.js';
import { CATEGORIES, EMOJI_LEVELS, FORMALITIES, LENGTHS } from '../labels.js';
import {
  Alert, FormInput, FormSelect, IconButton, PageHeader, PrimaryButton, SecondaryButton, SettingsSection, StatusIndicator,
} from '../components/ui.jsx';
import { previewText } from '../tonePreview.js';

const MIN_SAMPLES = 3;
const MAX_SAMPLES = 5;
const INFO_MAX = 500;

/** 화면 ① 가게 설정: 가게 정보 + 예시 답글로 톤 프로필 추출 → 수정 → 저장 */
export default function StoreSetup({ store, onSaved, toast, go }) {
  const [name, setName] = useState(store?.name ?? '');
  const [category, setCategory] = useState(store?.category ?? '카페');
  const [info, setInfo] = useState(store?.info ?? '');
  const [samples, setSamples] = useState(() => {
    const saved = store?.sampleReplies ?? [];
    return saved.length >= MIN_SAMPLES ? saved : [...saved, ...Array(MIN_SAMPLES - saved.length).fill('')];
  });
  const [tone, setTone] = useState(store?.toneProfile ?? null);
  const [newPhrase, setNewPhrase] = useState('');
  const [busy, setBusy] = useState(null); // 'store' | 'extract' | 'tone'
  const [error, setError] = useState(null);
  const [nameError, setNameError] = useState(null); // 입력창 바로 아래에 보여줄 검증 오류
  const nameRef = useRef(null);

  const filledSamples = samples.map((s) => s.trim()).filter(Boolean);

  async function saveStore(e) {
    e.preventDefault();
    if (!name.trim()) {
      setNameError('매장명을 입력하십시오.');
      nameRef.current?.focus();
      return;
    }
    setNameError(null);
    setBusy('store');
    setError(null);
    try {
      const body = { name: name.trim(), category, info: info.trim() };
      const saved = store ? await api.updateStore(store.id, body) : await api.createStore(body);
      onSaved(saved);
      toast.show(store ? '매장 정보가 저장되었습니다.' : '매장이 등록되었습니다. 예시 답글을 등록하십시오.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function extract() {
    if (filledSamples.length < MIN_SAMPLES) {
      setError(`예시 답글은 최소 ${MIN_SAMPLES}개가 필요합니다.`);
      return;
    }
    setBusy('extract');
    setError(null);
    try {
      setTone(await api.extractTone(store.id, filledSamples));
      toast.show('답글 스타일 분석 완료. 결과 확인 후 저장하십시오.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function saveTone() {
    setBusy('tone');
    setError(null);
    try {
      const firstTime = !store.toneProfile;
      const saved = await api.saveTone(store.id, tone, filledSamples);
      onSaved(saved);
      if (firstTime) {
        toast.show('답글 스타일이 저장되었습니다.');
        go('input');
      } else {
        toast.show('답글 스타일이 저장되었습니다.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const updateTone = (patch) => setTone((t) => ({ ...t, ...patch }));

  function addPhrase() {
    const v = newPhrase.trim();
    if (!v || tone.phrases.includes(v)) return;
    updateTone({ phrases: [...tone.phrases, v] });
    setNewPhrase('');
  }

  const sampleReady = filledSamples.length >= MIN_SAMPLES;
  let toneStatus = <StatusIndicator tone="neutral">분석 전</StatusIndicator>;
  if (store?.toneProfile) toneStatus = <StatusIndicator tone="success" icon="confirm">저장됨</StatusIndicator>;
  else if (tone) toneStatus = <StatusIndicator tone="complaint">분석 완료, 저장 전</StatusIndicator>;

  return (
    <>
      <PageHeader title="매장 설정" description="매장 정보와 답글 작성에 사용할 기본 설정을 관리합니다." />

      {error && <Alert>{error}</Alert>}

      <div className="settings">
        <SettingsSection
          as="form"
          onSubmit={saveStore}
          noValidate
          title="매장 정보"
          description="매장명과 업종, 답글에 반영할 매장 소개입니다."
          status={store
            ? <StatusIndicator tone="success" icon="confirm">등록됨</StatusIndicator>
            : <StatusIndicator tone="neutral">미등록</StatusIndicator>}
          actions={(
            <PrimaryButton type="submit" icon="save" loading={busy === 'store'}>
              {store ? '설정 저장' : '매장 등록'}
            </PrimaryButton>
          )}
        >
          <div className="grid-2">
            <FormInput id="storeName" label="매장명" ref={nameRef} value={name} placeholder="예: 리플라이 커피"
                       maxLength={100} error={nameError}
                       onChange={(e) => { setName(e.target.value); if (nameError) setNameError(null); }} />
            <FormSelect id="storeCategory" label="업종" value={category} options={CATEGORIES}
                        onChange={(e) => setCategory(e.target.value)} />
          </div>
          <FormInput id="storeInfo" label="매장 소개·운영 방식 (선택)" multiline rows={3} value={info} maxLength={INFO_MAX}
                     counter={`${info.length}/${INFO_MAX}`}
                     placeholder="예: 주문이 들어오면 바로 튀깁니다. 소스는 매장에서 직접 만듭니다."
                     hint="AI는 여기 적힌 내용만 운영 방식으로 답글에 언급하고, 적히지 않은 재료·조리법은 지어내지 않습니다."
                     onChange={(e) => setInfo(e.target.value)} />
        </SettingsSection>

        <SettingsSection
          title="예시 답글"
          description={`기존에 작성한 답글을 ${MIN_SAMPLES}~${MAX_SAMPLES}개 등록하면 AI가 매장의 응대 스타일을 분석합니다. 분석에만 사용됩니다.`}
          status={store && (
            <StatusIndicator tone={sampleReady ? 'success' : 'neutral'} icon={sampleReady ? 'confirm' : undefined}>
              {filledSamples.length} / {MAX_SAMPLES}개 입력
            </StatusIndicator>
          )}
          actionsStart={store && (
            <SecondaryButton icon="add" disabled={samples.length >= MAX_SAMPLES} onClick={() => setSamples([...samples, ''])}>
              예시 답글 추가
            </SecondaryButton>
          )}
          actions={store && (
            <PrimaryButton icon="analyze" onClick={extract} loading={busy === 'extract'} loadingText="분석 중"
                           disabled={!sampleReady}>
              답글 스타일 분석
            </PrimaryButton>
          )}
        >
          {!store ? (
            <p className="hint">매장을 등록하면 입력할 수 있습니다.</p>
          ) : (
            <div className="sample-list">
              {samples.map((s, i) => (
                <div className="sample" key={i}>
                  <label className="sample-no" htmlFor={`sample${i}`}><span className="sr-only">예시 답글 </span>{i + 1}</label>
                  <FormInput id={`sample${i}`} multiline rows={2} value={s} counter={`${s.length}자`}
                             placeholder="예: 찾아주셔서 감사합니다. 다음에도 맛있는 커피로 보답하겠습니다."
                             onChange={(e) => setSamples(samples.map((v, j) => (j === i ? e.target.value : v)))} />
                  {samples.length > MIN_SAMPLES ? (
                    <IconButton icon="delete" tone="danger" label={`예시 ${i + 1} 삭제`}
                                onClick={() => setSamples(samples.filter((_, j) => j !== i))} />
                  ) : <span aria-hidden="true" />}
                </div>
              ))}
            </div>
          )}
        </SettingsSection>

        <SettingsSection
          title="답글 스타일"
          description="분석된 높임말, 이모지, 문장 길이, 자주 쓰는 표현입니다. 항목별로 수정한 뒤 저장합니다."
          status={store && toneStatus}
          actionsStart={store && tone && store.toneProfile && (
            <SecondaryButton tone="neutral" onClick={() => go('input')}>리뷰 입력으로 이동</SecondaryButton>
          )}
          actions={store && tone && (
            <PrimaryButton icon="save" onClick={saveTone} loading={busy === 'tone'}>스타일 저장</PrimaryButton>
          )}
        >
          {!store && <p className="hint">매장을 등록하고 예시 답글을 분석하면 결과가 표시됩니다.</p>}
          {store && !tone && <p className="hint">예시 답글로 답글 스타일 분석을 실행하면 결과가 표시됩니다.</p>}
          {store && tone && (
            <>
              <div className="grid-3">
                <FormSelect id="formality" label="높임말" value={tone.formality} options={FORMALITIES}
                            onChange={(e) => updateTone({ formality: e.target.value })} />
                <FormSelect id="emojiLevel" label="이모지" value={tone.emojiLevel} options={EMOJI_LEVELS}
                            hint={tone.emojiExamples.length > 0 ? `자주 쓰는 이모지 ${tone.emojiExamples.join(' ')}` : undefined}
                            onChange={(e) => updateTone({ emojiLevel: e.target.value })} />
                <FormSelect id="length" label="문장 길이" value={tone.length} options={LENGTHS}
                            onChange={(e) => updateTone({ length: e.target.value })} />
              </div>
              <div className="field">
                <label className="label" htmlFor="newPhrase">자주 쓰는 표현</label>
                <div className="tags">
                  {tone.phrases.length === 0 && <span className="hint">등록된 표현 없음</span>}
                  {tone.phrases.map((p) => (
                    <span className="tag" key={p}>
                      {p}
                      <IconButton icon="remove" size="sm" tone="danger" label={`${p} 삭제`}
                                  onClick={() => updateTone({ phrases: tone.phrases.filter((x) => x !== p) })} />
                    </span>
                  ))}
                </div>
                <div className="inline-add">
                  <FormInput id="newPhrase" placeholder="표현 입력 후 Enter" value={newPhrase}
                             onChange={(e) => setNewPhrase(e.target.value)}
                             onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); addPhrase(); } }} />
                  <SecondaryButton tone="neutral" icon="add" onClick={addPhrase} disabled={!newPhrase.trim()}>추가</SecondaryButton>
                </div>
              </div>
              <FormInput id="closing" label="마무리 인사" value={tone.closing} placeholder="선택 입력"
                         onChange={(e) => updateTone({ closing: e.target.value })} />
              <div className="preview-block">
                <span className="label">미리보기</span>
                <p className="ai-text">{previewText(tone)}</p>
              </div>
            </>
          )}
        </SettingsSection>
      </div>
    </>
  );
}
