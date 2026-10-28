import { useState } from 'react';
import { api } from '../api.js';
import { CATEGORIES, EMOJI_LEVELS, FORMALITIES, LENGTHS } from '../labels.js';
import Spinner from '../components/Spinner.jsx';
import Icon from '../components/Icon.jsx';
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

  const filledSamples = samples.map((s) => s.trim()).filter(Boolean);

  async function saveStore(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('가게 이름을 입력해주세요.');
      return;
    }
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
      <div className="page-head">
        <div className="page-title">
          <h1>가게 설정</h1>
          <p>예전에 직접 쓴 답글로 가게 말투를 만들어요. 한 번 저장하면 모든 답글 초안에 반영돼요.</p>
        </div>
      </div>

      {error && (
        <div className="alert" role="alert">
          <Icon name="error" />
          <span>{error}</span>
        </div>
      )}

      <form className="section" onSubmit={saveStore}>
        <div className="section-head">
          <div>
            <h2>가게 정보</h2>
            <p>답글에 쓰일 가게 이름과 업종이에요.</p>
          </div>
        </div>
        <div className="section-body">
          <div className="grid-2">
            <div className="field">
              <label className="label" htmlFor="storeName">가게 이름</label>
              <input id="storeName" className="input" type="text" value={name} placeholder="예: 리플라이 커피"
                     onChange={(e) => setName(e.target.value)} maxLength={100} />
            </div>
            <div className="field">
              <label className="label" htmlFor="storeCategory">업종</label>
              <select id="storeCategory" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="section-foot">
          <div className="end">
            <button className="btn btn-primary" type="submit" disabled={busy === 'store'}>
              {busy === 'store' ? <Spinner /> : <Icon name="save" />}
              {store ? '가게 정보 저장' : '가게 등록'}
            </button>
          </div>
        </div>
      </form>

      {store && (
        <section className="section">
          <div className="section-head">
            <div>
              <h2>예시 답글</h2>
              <p>예전에 직접 쓴 답글을 {MIN_SAMPLES}~{MAX_SAMPLES}개 넣어 주세요. 말투 분석에만 쓰여요.</p>
            </div>
            <span className="hint">{filledSamples.length} / {MAX_SAMPLES}</span>
          </div>
          <div className="section-body">
            <div className="sample-list">
              {samples.map((s, i) => (
                <div className="sample" key={i}>
                  <label className="sample-no" htmlFor={`sample${i}`}>예시 {i + 1}</label>
                  <div className="sample-input">
                    <textarea id={`sample${i}`} className="textarea" value={s} rows={3}
                              placeholder="예: 찾아주셔서 감사합니다! 다음에도 맛있는 커피로 보답할게요."
                              onChange={(e) => setSamples(samples.map((v, j) => (j === i ? e.target.value : v)))} />
                    <span className="counter">{s.length}자</span>
                  </div>
                  {samples.length > MIN_SAMPLES ? (
                    <button type="button" className="icon-btn danger" aria-label={`예시 ${i + 1} 삭제`}
                            onClick={() => setSamples(samples.filter((_, j) => j !== i))}>
                      <Icon name="delete" />
                    </button>
                  ) : <span aria-hidden="true" />}
                </div>
              ))}
            </div>
          </div>
          <div className="section-foot">
            <button type="button" className="btn btn-outline" disabled={samples.length >= MAX_SAMPLES}
                    onClick={() => setSamples([...samples, ''])}>
              <Icon name="add" />
              예시 추가
            </button>
            <div className="end">
              <button type="button" className="btn btn-primary" onClick={extract}
                      disabled={busy === 'extract' || filledSamples.length < MIN_SAMPLES}>
                {busy === 'extract' ? <Spinner /> : <Icon name="analyze" />}
                {busy === 'extract' ? '분석 중' : '말투 분석하기'}
              </button>
            </div>
          </div>
        </section>
      )}

      {store && tone && (
        <section className="section">
          <div className="section-head">
            <div>
              <h2>톤 프로필</h2>
              <p>분석 결과예요. 직접 고친 뒤 저장할 수 있어요.</p>
            </div>
          </div>
          <div className="section-body">
            <div className="grid-3">
              <ToneSelect id="formality" label="존댓말" value={tone.formality} options={FORMALITIES}
                          onChange={(v) => updateTone({ formality: v })} />
              <ToneSelect id="emojiLevel" label="이모지" value={tone.emojiLevel} options={EMOJI_LEVELS}
                          onChange={(v) => updateTone({ emojiLevel: v })} />
              <ToneSelect id="length" label="문장 길이" value={tone.length} options={LENGTHS}
                          onChange={(v) => updateTone({ length: v })} />
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
                    <button type="button" className="icon-btn" aria-label={`${p} 삭제`}
                            onClick={() => updateTone({ phrases: tone.phrases.filter((x) => x !== p) })}>
                      <Icon name="remove" size={16} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="inline-add">
                <input type="text" id="newPhrase" className="input" placeholder="표현 입력 후 Enter" value={newPhrase}
                       onChange={(e) => setNewPhrase(e.target.value)}
                       onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPhrase(); } }} />
                <button type="button" className="btn" onClick={addPhrase}>
                  <Icon name="add" />
                  추가
                </button>
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="closing">마무리 인사</label>
              <input id="closing" className="input" type="text" value={tone.closing}
                     onChange={(e) => updateTone({ closing: e.target.value })} placeholder="없으면 비워 두세요" />
            </div>
            <div className="field">
              <span className="label">미리보기</span>
              <p className="ai-text">{previewText(tone)}</p>
            </div>
          </div>
          <div className="section-foot">
            <span className="hint">
              {store.toneProfile ? '저장된 톤 프로필이 있어요' : '아직 저장하지 않았어요'}
            </span>
            <div className="end">
              {store.toneProfile && (
                <button type="button" className="btn" onClick={() => go('input')}>리뷰 입력하러 가기</button>
              )}
              <button type="button" className="btn btn-primary" onClick={saveTone} disabled={busy === 'tone'}>
                {busy === 'tone' ? <Spinner /> : <Icon name="save" />}
                톤 프로필 저장
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function ToneSelect({ id, label, value, options, onChange }) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}
