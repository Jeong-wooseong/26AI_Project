import { useRef, useState } from 'react';
import { api } from '../api.js';
import { CATEGORIES, EMOJI_LEVELS, FORMALITIES, LENGTHS } from '../labels.js';
import { Alert, FormInput, FormSelect, IconButton, PageHeader, PrimaryButton, SecondaryButton, SectionCard } from '../components/ui.jsx';
import { previewText } from '../tonePreview.js';

const MIN_SAMPLES = 3;
const MAX_SAMPLES = 5;

/** 화면 ① 가게 설정: 가게 정보 + 예시 답글로 톤 프로필 추출 → 수정 → 저장 */
export default function StoreSetup({ store, onSaved, toast, go }) {
  const [name, setName] = useState(store?.name ?? '');
  const [category, setCategory] = useState(store?.category ?? '카페');
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
      setNameError('가게 이름을 입력해주세요.');
      nameRef.current?.focus();
      return;
    }
    setNameError(null);
    setBusy('store');
    setError(null);
    try {
      const body = { name: name.trim(), category };
      const saved = store ? await api.updateStore(store.id, body) : await api.createStore(body);
      onSaved(saved);
      toast.show(store ? '가게 정보를 저장했어요' : '가게를 등록했어요. 이제 말투를 설정해주세요');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function extract() {
    if (filledSamples.length < MIN_SAMPLES) {
      setError(`예시 답글을 ${MIN_SAMPLES}개 이상 입력해주세요.`);
      return;
    }
    setBusy('extract');
    setError(null);
    try {
      setTone(await api.extractTone(store.id, filledSamples));
      toast.show('말투를 분석했어요. 확인 후 저장해주세요');
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
        toast.show('톤 프로필을 저장했어요. 이제 리뷰를 입력해보세요');
        go('input');
      } else {
        toast.show('톤 프로필을 저장했어요');
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

  return (
    <>
      <PageHeader
        title="가게 설정"
        description="예전에 직접 쓴 답글로 가게 말투를 만들어요. 한 번 저장하면 모든 답글 초안에 반영돼요."
      />

      {error && <Alert>{error}</Alert>}

      <SectionCard
        as="form"
        onSubmit={saveStore}
        noValidate
        title="가게 정보"
        description="답글에 쓰일 가게 이름과 업종이에요."
        footer={
          <PrimaryButton type="submit" icon="save" loading={busy === 'store'}>
            {store ? '가게 정보 저장' : '가게 등록'}
          </PrimaryButton>
        }
      >
        <div className="grid-2">
          <FormInput id="storeName" label="가게 이름" ref={nameRef} value={name} placeholder="예: 리플라이 커피"
                     maxLength={100} error={nameError}
                     onChange={(e) => { setName(e.target.value); if (nameError) setNameError(null); }} />
          <FormSelect id="storeCategory" label="업종" value={category} options={CATEGORIES}
                      onChange={(e) => setCategory(e.target.value)} />
        </div>
      </SectionCard>

      {store && (
        <SectionCard
          title="예시 답글"
          description={`예전에 직접 쓴 답글을 ${MIN_SAMPLES}~${MAX_SAMPLES}개 넣어 주세요. 말투 분석에만 쓰여요.`}
          aside={<span className="hint">{filledSamples.length} / {MAX_SAMPLES}개</span>}
          footerStart={
            <SecondaryButton icon="add" disabled={samples.length >= MAX_SAMPLES}
                             onClick={() => setSamples([...samples, ''])}>
              예시 추가
            </SecondaryButton>
          }
          footer={
            <PrimaryButton icon="analyze" onClick={extract} loading={busy === 'extract'} loadingText="분석 중"
                           disabled={filledSamples.length < MIN_SAMPLES}>
              말투 분석하기
            </PrimaryButton>
          }
        >
          <div className="sample-list">
            {samples.map((s, i) => (
              <div className="sample" key={i}>
                <label className="sample-no" htmlFor={`sample${i}`}>예시 {i + 1}</label>
                <FormInput id={`sample${i}`} multiline rows={3} value={s} counter={`${s.length}자`}
                           placeholder="예: 찾아주셔서 감사합니다! 다음에도 맛있는 커피로 보답할게요."
                           onChange={(e) => setSamples(samples.map((v, j) => (j === i ? e.target.value : v)))} />
                {samples.length > MIN_SAMPLES ? (
                  <IconButton icon="delete" tone="danger" label={`예시 ${i + 1} 삭제`}
                              onClick={() => setSamples(samples.filter((_, j) => j !== i))} />
                ) : <span aria-hidden="true" />}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {store && tone && (
        <SectionCard
          title="톤 프로필"
          description="분석 결과예요. 직접 고친 뒤 저장할 수 있어요."
          footerStart={
            <span className="hint">{store.toneProfile ? '저장된 톤 프로필이 있어요' : '아직 저장하지 않았어요'}</span>
          }
          footer={
            <>
              {store.toneProfile && (
                <SecondaryButton tone="neutral" onClick={() => go('input')}>리뷰 입력하러 가기</SecondaryButton>
              )}
              <PrimaryButton icon="save" onClick={saveTone} loading={busy === 'tone'}>톤 프로필 저장</PrimaryButton>
            </>
          }
        >
          <div className="grid-3">
            <FormSelect id="formality" label="존댓말" value={tone.formality} options={FORMALITIES}
                        onChange={(e) => updateTone({ formality: e.target.value })} />
            <FormSelect id="emojiLevel" label="이모지" value={tone.emojiLevel} options={EMOJI_LEVELS}
                        onChange={(e) => updateTone({ emojiLevel: e.target.value })} />
            <FormSelect id="length" label="문장 길이" value={tone.length} options={LENGTHS}
                        onChange={(e) => updateTone({ length: e.target.value })} />
          </div>
          {tone.emojiExamples.length > 0 && (
            <p className="hint">자주 쓰는 이모지: {tone.emojiExamples.join(' ')}</p>
          )}
          <div className="field">
            <label className="label" htmlFor="newPhrase">자주 쓰는 표현</label>
            <div className="tags">
              {tone.phrases.length === 0 && <span className="hint">아직 없어요</span>}
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
          <FormInput id="closing" label="마무리 인사" value={tone.closing} placeholder="없으면 비워 두세요"
                     onChange={(e) => updateTone({ closing: e.target.value })} />
          <div className="field">
            <span className="label">미리보기</span>
            <p className="ai-text">{previewText(tone)}</p>
          </div>
        </SectionCard>
      )}
    </>
  );
}
