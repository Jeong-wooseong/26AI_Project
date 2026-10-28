import { useState } from 'react';
import { api } from '../api.js';
import { CATEGORIES, EMOJI_LEVELS, FORMALITIES, LENGTHS } from '../labels.js';
import Spinner from '../components/Spinner.jsx';

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
      <div className="head">
        <div>
          <h1>가게 설정</h1>
          <p>예전에 직접 쓴 답글로 가게 말투를 만들어요. 한 번 저장하면 모든 답글에 반영돼요.</p>
        </div>
      </div>

      {error && <p className="error-box" role="alert">{error}</p>}

      <form className="panel" onSubmit={saveStore}>
        <h2>가게 정보</h2>
        <div className="row">
          <div className="field">
            <label className="label" htmlFor="storeName">가게 이름</label>
            <input id="storeName" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </div>
          <div className="field">
            <label className="label" htmlFor="storeCategory">업종</label>
            <select id="storeCategory" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="actions">
          <span />
          <button className="btn primary" type="submit" disabled={busy === 'store'}>
            {busy === 'store' && <Spinner />}
            {store ? '가게 정보 저장' : '가게 등록'}
          </button>
        </div>
      </form>

      {store && (
        <section className="panel">
          <h2>예시 답글 <span className="note">{MIN_SAMPLES}~{MAX_SAMPLES}개</span></h2>
          {samples.map((s, i) => (
            <div className="field" key={i}>
              <div className="row between">
                <label className="label" htmlFor={`sample${i}`}>예시 {i + 1}</label>
                {samples.length > MIN_SAMPLES && (
                  <button type="button" className="link-btn"
                          onClick={() => setSamples(samples.filter((_, j) => j !== i))}>
                    삭제
                  </button>
                )}
              </div>
              <textarea id={`sample${i}`} value={s}
                        onChange={(e) => setSamples(samples.map((v, j) => (j === i ? e.target.value : v)))} />
            </div>
          ))}
          <div className="actions">
            <button type="button" className="btn" disabled={samples.length >= MAX_SAMPLES}
                    onClick={() => setSamples([...samples, ''])}>
              예시 추가
            </button>
            <button type="button" className="btn primary" onClick={extract}
                    disabled={busy === 'extract' || filledSamples.length < MIN_SAMPLES}>
              {busy === 'extract' && <Spinner />}
              {busy === 'extract' ? '분석 중' : '말투 분석하기'}
            </button>
          </div>
        </section>
      )}

      {store && tone && (
        <section className="panel">
          <h2>톤 프로필 <span className="note">직접 수정할 수 있어요</span></h2>
          <div className="tone-grid">
            <ToneSelect id="formality" label="존댓말" value={tone.formality} options={FORMALITIES}
                        onChange={(v) => updateTone({ formality: v })} />
            <ToneSelect id="emojiLevel" label="이모지" value={tone.emojiLevel} options={EMOJI_LEVELS}
                        onChange={(v) => updateTone({ emojiLevel: v })} />
            <ToneSelect id="length" label="문장 길이" value={tone.length} options={LENGTHS}
                        onChange={(v) => updateTone({ length: v })} />
          </div>
          {tone.emojiExamples.length > 0 && (
            <p className="note">자주 쓰는 이모지: {tone.emojiExamples.join(' ')}</p>
          )}
          <div className="field">
            <span className="label">자주 쓰는 표현</span>
            <div className="tags">
              {tone.phrases.length === 0 && <span className="note">아직 없어요</span>}
              {tone.phrases.map((p) => (
                <span className="tag" key={p}>
                  {p}
                  <button type="button" aria-label={`${p} 삭제`}
                          onClick={() => updateTone({ phrases: tone.phrases.filter((x) => x !== p) })}>×</button>
                </span>
              ))}
            </div>
            <div className="row">
              <input type="text" id="newPhrase" placeholder="표현 추가" value={newPhrase}
                     onChange={(e) => setNewPhrase(e.target.value)}
                     onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPhrase(); } }}
                     style={{ flex: '1 1 160px' }} />
              <button type="button" className="btn small" onClick={addPhrase}>추가</button>
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="closing">마무리 인사</label>
            <input id="closing" type="text" value={tone.closing}
                   onChange={(e) => updateTone({ closing: e.target.value })} placeholder="없으면 비워두세요" />
          </div>
          <div className="field">
            <span className="label">미리보기</span>
            <p className="preview">{previewText(tone)}</p>
          </div>
          <div className="actions">
            <span className="note">
              {store.toneProfile ? '저장된 톤 프로필이 있어요' : '아직 저장하지 않았어요'}
            </span>
            <div className="row">
              {store.toneProfile && (
                <button type="button" className="btn" onClick={() => go('input')}>리뷰 입력하러 가기</button>
              )}
              <button type="button" className="btn primary" onClick={saveTone} disabled={busy === 'tone'}>
                {busy === 'tone' && <Spinner />}
                저장
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
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

/** 톤 설정이 어떻게 보일지 감을 잡기 위한 고정 예문 (AI 호출 없음) */
function previewText(tone) {
  const first = {
    하십시오체: '맛있게 드셔주셔서 감사드립니다.',
    해요체: '맛있게 드셨다니 기뻐요!',
    '반말 섞임': '맛있게 먹었다니 기뻐요!',
  }[tone.formality] ?? '맛있게 드셨다니 기뻐요!';
  const middle = tone.length === '1~2문장' ? '' : ` ${tone.phrases[0] ?? '다음에도 정성껏 준비할게요'}.`;
  const emoji = tone.emojiLevel !== '없음' && tone.emojiExamples[0] ? ` ${tone.emojiExamples[0]}` : '';
  const closing = tone.closing ? ` ${tone.closing}` : '';
  return first + middle + emoji + closing;
}
