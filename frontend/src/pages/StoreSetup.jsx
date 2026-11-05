import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { CATEGORIES, CATEGORY_ICON, EMOJI_LEVELS, FORMALITIES, LENGTHS } from '../labels.js';
import Icon from '../components/Icon.jsx';
import {
  Alert, FlowSteps, FormInput, FormSelect, IconButton, PageHeader, PrimaryButton, SecondaryButton,
} from '../components/ui.jsx';
import { previewText } from '../tonePreview.js';
import AccountSection from '../components/AccountSection.jsx';
import Mascot from '../components/Mascot.jsx';
import ReplyGenerationLoader from '../components/reply/ReplyGenerationLoader.jsx';
import { formatDateTime } from '../components/reply/replyModel.js';

const MIN_SAMPLES = 3;
const MAX_SAMPLES = 5;
const INFO_MAX = 500;
const SAMPLE_MAX = 1000;
const LEARN_STEPS = ['예시 답글 읽는 중', '높임말·이모지 확인 중', '자주 쓰는 표현 찾는 중', '마무리 인사 정리 중'];
const LEARN_NOTE = '예시 답글은 말투 분석에만 쓰고, 답글에 그대로 옮기지 않습니다.';
const DEFAULT_TONES = [['POLITE', '정중형'], ['FRIENDLY', '친근형'], ['CONCISE', '간결형']];
const DEFAULT_SETTINGS = { defaultTone: 'POLITE', avoidDuplicates: true };

/** 학습 결과 한 칸에 보여줄 말 */
const TRAIT_WORDS = {
  formality: { 하십시오체: '격식 있게 (하십시오체)', 해요체: '부드럽게 (해요체)', '반말 섞임': '편하게 (반말 섞임)' },
  emojiLevel: { 없음: '쓰지 않음', 가끔: '가끔 씀', 자주: '자주 씀' },
  length: { '1~2문장': '짧게 (1~2문장)', '2~3문장': '보통 (2~3문장)', '3~4문장': '길게 (3~4문장)' },
};

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const padSamples = (list) => (list.length >= MIN_SAMPLES ? list : [...list, ...Array(MIN_SAMPLES - list.length).fill('')]);

/**
 * 화면 ① 매장 설정.
 *  매장(이름·업종·소개)과 답글 스타일(예시 답글 → 학습 → 미리보기 → 기본 설정)을 나눠 보여준다.
 *  답글 스타일 쪽은 바뀐 내용을 모아 아래 저장 줄 하나로 저장한다.
 */
export default function StoreSetup({ store, onSaved, toast, go, me, onAccountDeleted }) {
  const [name, setName] = useState(store?.name ?? '');
  const [category, setCategory] = useState(store?.category ?? '카페');
  const [info, setInfo] = useState(store?.info ?? '');
  const [samples, setSamples] = useState(() => padSamples(store?.sampleReplies ?? []));
  const [tone, setTone] = useState(store?.toneProfile ?? null); // 적용할 말투 (고칠 수 있음)
  const [learned, setLearned] = useState(store?.toneProfile ?? null); // 예시 답글에서 배운 그대로
  const [settings, setSettings] = useState(store?.replySettings ?? DEFAULT_SETTINGS);
  const [editing, setEditing] = useState(false);
  const [newPhrase, setNewPhrase] = useState('');
  const [busy, setBusy] = useState(null); // 'store' | 'learn' | 'style'
  const [error, setError] = useState(null);
  const [nameError, setNameError] = useState(null);
  const nameRef = useRef(null);
  const learnRef = useRef(null);

  const filled = samples.map((s) => s.trim()).filter(Boolean);
  const sampleReady = filled.length >= MIN_SAMPLES;
  const savedSamples = store?.sampleReplies ?? [];
  const learnedAll = !!store?.toneProfile;
  const storeDirty = !!store && (name.trim() !== store.name || category !== store.category || info.trim() !== (store.info ?? ''));
  const toneDirty = !!tone && !same(tone, store?.toneProfile);
  const samplesDirty = !same(filled, savedSamples);
  const settingsDirty = !!store && !same(settings, store.replySettings ?? DEFAULT_SETTINGS);
  const styleDirty = !!store && (toneDirty || (samplesDirty && !!tone) || settingsDirty);

  // 저장하지 않은 변경이 있으면 떠나기 전에 묻는다
  useEffect(() => {
    if (!styleDirty && !storeDirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [styleDirty, storeDirty]);

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
      toast.show(store ? '매장 정보를 저장했습니다.' : '매장을 등록했습니다. 이제 예시 답글을 넣으십시오.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function learn() {
    if (!sampleReady) {
      setError(`예시 답글은 최소 ${MIN_SAMPLES}개가 필요합니다.`);
      return;
    }
    setBusy('learn');
    setError(null);
    learnRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    try {
      const result = await api.extractTone(store.id, filled);
      setTone(result);
      setLearned(result);
      toast.show('말투를 배웠습니다. 결과를 확인하고 저장하십시오.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function saveStyle() {
    setBusy('style');
    setError(null);
    try {
      let saved = store;
      if (tone && (toneDirty || samplesDirty)) saved = await api.saveTone(store.id, tone, filled);
      if (settingsDirty) saved = await api.updateReplySettings(store.id, settings);
      onSaved(saved);
      setEditing(false);
      toast.show(learnedAll ? '답글 스타일을 저장했습니다.' : '답글 스타일을 저장했습니다. 이제 리뷰를 입력해 답글을 만들 수 있습니다.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  function revertStyle() {
    setSamples(padSamples(savedSamples));
    setTone(store?.toneProfile ?? null);
    setLearned(store?.toneProfile ?? null);
    setSettings(store?.replySettings ?? DEFAULT_SETTINGS);
    setEditing(false);
  }

  const updateTone = (patch) => setTone((t) => ({ ...t, ...patch }));
  function addPhrase() {
    const v = newPhrase.trim();
    if (!v || tone.phrases.includes(v) || tone.phrases.length >= 8) return;
    updateTone({ phrases: [...tone.phrases, v] });
    setNewPhrase('');
  }

  // 안내: 지금 할 일 하나 + 진행 단계
  let guide;
  if (!store) guide = '매장을 등록하면 예시 답글을 넣을 수 있어요.';
  else if (!sampleReady) guide = `사장님이 직접 쓴 답글을 ${MIN_SAMPLES - filled.length}개 더 넣어 주세요. 말투를 배우는 데 써요.`;
  else if (!tone) guide = '예시 답글이 준비됐어요. 답글 스타일 학습을 눌러 주세요.';
  else if (!learnedAll) guide = '말투를 배웠어요. 결과를 확인하고 아래에서 저장해 주세요.';
  else guide = '설정을 마쳤어요. 이 말투로 답글 초안을 만들어요.';
  const steps = [
    { label: '매장 정보', state: store ? 'done' : 'current' },
    { label: sampleReady ? `예시 답글 ${filled.length}개` : `예시 답글 ${filled.length}/${MIN_SAMPLES}`, state: !store ? 'todo' : sampleReady ? 'done' : 'current' },
    { label: '스타일 학습', state: learnedAll && !toneDirty ? 'done' : tone ? 'current' : 'todo' },
  ];

  return (
    <>
      <PageHeader title="매장 설정" description="매장 정보와 평소 답글 스타일을 설정하세요." />

      <div className={`setup-guide ${learnedAll ? 'is-ready' : ''}`}>
        <Mascot pose={learnedAll ? 'happy' : 'thinking'} size={52} />
        <div className="setup-guide-text">
          <p>{guide}</p>
          <FlowSteps steps={steps} className="is-compact" />
        </div>
        {learnedAll && !styleDirty && (
          <PrimaryButton icon="input" onClick={() => go('input')}>리뷰 입력하기</PrimaryButton>
        )}
      </div>

      {error && <Alert>{error}</Alert>}

      {/* ── 매장 ── */}
      <section className="setup-group" aria-labelledby="group-store">
        <div className="setup-group-head">
          <h2 id="group-store">매장</h2>
          <p>답글에 들어갈 매장 이름과 업종, 운영 방식입니다.</p>
        </div>
        <form className="sp-panel" onSubmit={saveStore} noValidate>
          <div className="sp-body">
            <div className="grid-2">
              <FormInput id="storeName" label="매장명" ref={nameRef} value={name} placeholder="예: 리플라이 커피"
                         maxLength={100} error={nameError}
                         onChange={(e) => { setName(e.target.value); if (nameError) setNameError(null); }} />
              <FormSelect id="storeCategory" label="업종" value={category} options={CATEGORIES} icon={CATEGORY_ICON[category]}
                          onChange={(e) => setCategory(e.target.value)} />
            </div>
            <FormInput id="storeInfo" label="매장 소개·운영 방식 (선택)" multiline rows={3} value={info} maxLength={INFO_MAX}
                       counter={`${info.length}/${INFO_MAX}`}
                       placeholder="예: 원두는 매일 아침 직접 로스팅합니다. 주문이 들어오면 바로 만듭니다."
                       hint="여기 적은 내용만 답글에 운영 방식으로 언급하고, 적지 않은 재료·조리법은 지어내지 않습니다."
                       onChange={(e) => setInfo(e.target.value)} />
          </div>
          <div className="sp-foot">
            <SaveState dirty={storeDirty} saved={!!store} at={store?.updatedAt} />
            <PrimaryButton type="submit" icon="save" loading={busy === 'store'} disabled={!!store && !storeDirty}>
              {store ? '매장 정보 저장' : '매장 등록'}
            </PrimaryButton>
          </div>
        </form>
      </section>

      {/* ── 답글 스타일 ── */}
      <section className={`setup-group ${store ? '' : 'is-locked'}`} aria-labelledby="group-style">
        <div className="setup-group-head">
          <h2 id="group-style">답글 스타일</h2>
          <p>평소 쓰던 답글로 말투를 배우고, 답글을 만들 때 기본으로 쓸 설정을 정합니다.</p>
        </div>

        {!store ? (
          <p className="sp-locked"><Icon name="lock" size={16} />매장을 먼저 등록하면 설정할 수 있습니다.</p>
        ) : (
          <>
            <div className="setup-2col">
              {/* 예시 답글 */}
              <div className="sp-panel">
                <div className="sp-head">
                  <h3>예시 답글</h3>
                  <span className={`sp-count ${sampleReady ? 'is-ok' : ''}`}>{filled.length} / {MAX_SAMPLES}개</span>
                </div>
                <div className="sp-body">
                  {!sampleReady && (
                    <p className="sample-nudge">
                      <Icon name="info" size={16} />
                      배달앱에 실제로 달았던 답글을 {MIN_SAMPLES}개 이상 붙여 넣으십시오. 칭찬·불만 답글을 섞으면 말투를 더 잘 배웁니다.
                    </p>
                  )}
                  <ul className="sample-rows">
                    {samples.map((s, i) => (
                      <li key={i} className={s.trim() ? 'is-filled' : ''}>
                        <div className="sample-row-head">
                          <label htmlFor={`sample${i}`}>예시 답글 {i + 1}</label>
                          <span>{s.length}자</span>
                          {samples.length > MIN_SAMPLES && (
                            <IconButton icon="delete" tone="danger" size="sm" label={`예시 답글 ${i + 1} 삭제`}
                                        onClick={() => setSamples(samples.filter((_, j) => j !== i))} />
                          )}
                        </div>
                        <FormInput id={`sample${i}`} multiline rows={2} value={s} maxLength={SAMPLE_MAX}
                                   placeholder="예: 찾아주셔서 감사합니다. 다음에도 맛있는 커피로 보답하겠습니다."
                                   onChange={(e) => setSamples(samples.map((v, j) => (j === i ? e.target.value : v)))} />
                      </li>
                    ))}
                  </ul>
                  {samples.length < MAX_SAMPLES && (
                    <button type="button" className="add-row" onClick={() => setSamples([...samples, ''])}>
                      <Icon name="add" size={18} />예시 답글 추가
                    </button>
                  )}
                </div>
              </div>

              {/* 답글 스타일 학습 */}
              <div className="sp-panel" ref={learnRef}>
                <div className="sp-head">
                  <h3>답글 스타일 학습</h3>
                  <LearnState tone={tone} learnedAll={learnedAll} dirty={toneDirty || (samplesDirty && !!tone)} />
                </div>
                <div className="sp-body">
                  {busy === 'learn' ? (
                    <ReplyGenerationLoader steps={LEARN_STEPS} note={LEARN_NOTE} pose="analyzing" />
                  ) : !learned ? (
                    <div className="learn-empty">
                      <ol className="learn-steps">
                        <li className={sampleReady ? 'is-done' : 'is-current'}>예시 답글 {MIN_SAMPLES}개 이상 넣기</li>
                        <li className={sampleReady ? 'is-current' : ''}>학습 버튼 누르기</li>
                        <li>결과 확인 후 저장</li>
                      </ol>
                      <PrimaryButton icon="sparkles" onClick={learn} disabled={!sampleReady}>답글 스타일 학습</PrimaryButton>
                    </div>
                  ) : (
                    <>
                      <dl className="traits">
                        <Trait label="존댓말 수준" value={TRAIT_WORDS.formality[learned.formality] ?? learned.formality} />
                        <Trait label="이모지 사용 빈도" value={TRAIT_WORDS.emojiLevel[learned.emojiLevel] ?? learned.emojiLevel}
                               extra={learned.emojiExamples?.length ? learned.emojiExamples.join(' ') : null}
                               changed={tone.emojiLevel !== learned.emojiLevel && `기본 설정에서 '${tone.emojiLevel}'(으)로 바꿈`} />
                        <Trait label="평균 답글 길이" value={TRAIT_WORDS.length[learned.length] ?? learned.length}
                               changed={tone.length !== learned.length && `기본 설정에서 '${tone.length}'(으)로 바꿈`} />
                        <Trait label="자주 쓰는 표현" value={tone.phrases.length ? null : '찾지 못함'}
                               chips={tone.phrases} />
                        <Trait label="마무리 인사" value={tone.closing || '정해진 인사 없음'} wide />
                      </dl>
                      {editing ? (
                        <div className="trait-edit">
                          <FormSelect id="formality" label="존댓말 수준" value={tone.formality} options={FORMALITIES}
                                      onChange={(e) => updateTone({ formality: e.target.value })} />
                          <div className="field">
                            <label className="label" htmlFor="newPhrase">자주 쓰는 표현 (최대 8개)</label>
                            <div className="tags">
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
                          <FormInput id="closing" label="마무리 인사" value={tone.closing} placeholder="예: 오늘도 좋은 하루 되세요!"
                                     onChange={(e) => updateTone({ closing: e.target.value })} />
                        </div>
                      ) : null}
                      <div className="learn-actions">
                        <button type="button" className="text-link" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
                          <Icon name="edit" size={15} />{editing ? '고치기 닫기' : '표현·인사 직접 고치기'}
                        </button>
                        <SecondaryButton tone="neutral" size="sm" icon="retry" onClick={learn} disabled={!sampleReady}>다시 학습하기</SecondaryButton>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* 학습 결과 미리보기 */}
            {tone && (
              <div className="sp-panel">
                <div className="sp-head">
                  <h3>학습 결과 미리보기</h3>
                  <p>사장님 답글과, 배운 말투로 쓴 예시 문장을 나란히 비교합니다.</p>
                </div>
                <div className="sp-body compare-cols">
                  <figure className="compare-card">
                    <figcaption><Icon name="user" size={15} />사장님 예시 답글</figcaption>
                    <blockquote>{filled[0] ?? '예시 답글이 없습니다.'}</blockquote>
                  </figure>
                  <figure className="compare-card is-ai">
                    <figcaption><Icon name="sparkles" size={15} />배운 말투로 쓴 예시</figcaption>
                    <blockquote>{previewText(tone)}</blockquote>
                    <p className="hint">높은 별점 칭찬 리뷰를 가정한 예시입니다. 실제 답글은 리뷰 내용에 맞춰 새로 씁니다.</p>
                  </figure>
                </div>
              </div>
            )}

            {/* 답글 기본 설정 */}
            <div className="sp-panel">
              <div className="sp-head">
                <h3>답글 기본 설정</h3>
                <p>답글 초안을 만들 때 기본으로 적용합니다.</p>
              </div>
              <div className="sp-body defaults">
                <OptionRow label="기본 답글 유형" hint="오늘의 리뷰와 일괄 처리에서 먼저 보여줄 말투입니다."
                           value={settings.defaultTone} options={DEFAULT_TONES}
                           onChange={(v) => setSettings((x) => ({ ...x, defaultTone: v }))} />
                <OptionRow label="이모지 사용" hint={tone ? '학습한 값에서 바꿀 수 있습니다.' : '학습한 뒤 바꿀 수 있습니다.'}
                           value={tone?.emojiLevel} options={EMOJI_LEVELS.map((v) => [v, v === '없음' ? '쓰지 않음' : v])}
                           disabled={!tone} onChange={(v) => updateTone({ emojiLevel: v })} />
                <OptionRow label="답글 길이" hint={tone ? '학습한 값에서 바꿀 수 있습니다.' : '학습한 뒤 바꿀 수 있습니다.'}
                           value={tone?.length} options={LENGTHS.map((v) => [v, v])}
                           disabled={!tone} onChange={(v) => updateTone({ length: v })} />
                <div className="option-row">
                  <div className="option-row-text">
                    <span className="option-row-label" id="dup-label">중복 답글 방지</span>
                    <span className="hint">최근 답글과 표현이 겹치면 다시 만들어 같은 문구가 반복되지 않게 합니다. 끄면 생성이 조금 빨라집니다.</span>
                  </div>
                  <label className="switch">
                    <input type="checkbox" aria-labelledby="dup-label" checked={settings.avoidDuplicates}
                           onChange={(e) => setSettings((x) => ({ ...x, avoidDuplicates: e.target.checked }))} />
                    <span className="switch-track" aria-hidden="true" />
                    {settings.avoidDuplicates ? '켜짐' : '꺼짐'}
                  </label>
                </div>
              </div>
            </div>

            {styleDirty && (
              <div className="save-bar" role="region" aria-label="저장하지 않은 변경">
                <p><Icon name="info" size={16} />저장하지 않은 답글 스타일 변경이 있습니다.</p>
                <div className="save-bar-actions">
                  <SecondaryButton tone="neutral" onClick={revertStyle} disabled={busy === 'style'}>되돌리기</SecondaryButton>
                  <PrimaryButton icon="save" onClick={saveStyle} loading={busy === 'style'} loadingText="저장 중"
                                 disabled={!tone && !settingsDirty}>
                    답글 스타일 저장
                  </PrimaryButton>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <AccountSection me={me} onDeleted={onAccountDeleted} />
    </>
  );
}

function SaveState({ dirty, saved, at }) {
  if (dirty) return <span className="save-state is-dirty"><i aria-hidden="true" />저장하지 않은 변경</span>;
  if (saved) return <span className="save-state is-saved"><Icon name="confirm" size={15} />저장됨{at ? ` ${formatDateTime(at)}` : ''}</span>;
  return <span className="save-state">아직 등록하지 않았습니다</span>;
}

function LearnState({ tone, learnedAll, dirty }) {
  if (!tone) return <span className="learn-state">학습 전</span>;
  if (dirty || !learnedAll) return <span className="learn-state is-pending"><i aria-hidden="true" />학습 완료, 저장 전</span>;
  return <span className="learn-state is-done"><Icon name="confirm" size={14} />학습 완료</span>;
}

function Trait({ label, value, extra, chips, changed, wide }) {
  return (
    <div className={`trait ${wide ? 'is-wide' : ''}`}>
      <dt>{label}</dt>
      <dd>
        {value && <strong>{value}</strong>}
        {extra && <span className="trait-extra">{extra}</span>}
        {chips?.length > 0 && <span className="trait-chips">{chips.map((c) => <span key={c} className="tag">{c}</span>)}</span>}
        {changed && <span className="trait-changed">{changed}</span>}
      </dd>
    </div>
  );
}

/** 라디오처럼 하나만 고르는 줄 (세그먼트) */
function OptionRow({ label, hint, value, options, onChange, disabled }) {
  const id = `opt-${label}`;
  return (
    <div className="option-row">
      <div className="option-row-text">
        <span className="option-row-label" id={id}>{label}</span>
        {hint && <span className="hint">{hint}</span>}
      </div>
      <div className="seg option-seg" role="radiogroup" aria-labelledby={id}>
        {options.map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} className="seg-btn" disabled={disabled}
                  aria-pressed={value === v} onClick={() => onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
