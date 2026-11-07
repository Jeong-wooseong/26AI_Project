import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { CATEGORIES, CATEGORY_ICON, EMOJI_LEVELS, FORMALITIES, LENGTHS } from '../labels.js';
import Icon from '../components/Icon.jsx';
import {
  Alert, FlowSteps, FormInput, FormSelect, IconButton, PageHeader, PrimaryButton, SecondaryButton,
} from '../components/ui.jsx';
import { markParts, previewText } from '../tonePreview.js';
import AccountSection from '../components/AccountSection.jsx';
import PlaceSearch from '../components/PlaceSearch.jsx';
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
// 미리보기 답글이 가정하는 리뷰 (previewText 는 높은 별점 칭찬 리뷰에 맞춘 문장)
const SAMPLE_REVIEW = '정말 맛있게 잘 먹었어요! 포장도 꼼꼼해서 좋았습니다.';

const MAX_MENUS = 10;
const SERVICES = [['delivery', '배달'], ['takeout', '포장'], ['dineIn', '매장 식사']];
const KAKAO_PLACE_URL = /^https?:\/\/place\.map\.kakao\.com\/\d+$/;

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const blankMenu = () => ({ name: '', description: '' });

/** 저장·비교용으로 정리한 메뉴·이용 방법·영업시간·장소 (서버 StoreProfile.normalized 와 같은 규칙) */
function cleanProfile(p) {
  return {
    menus: (p?.menus ?? [])
      .map((m) => ({ name: (m.name ?? '').trim(), description: (m.description ?? '').trim() || null }))
      .filter((m) => m.name),
    delivery: !!p?.delivery,
    takeout: !!p?.takeout,
    dineIn: !!p?.dineIn,
    hours: (p?.hours ?? '').trim() || null,
    place: p?.place?.url ? { id: p.place.id ?? null, address: p.place.address ?? null, url: p.place.url } : null,
  };
}
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
  const [menus, setMenus] = useState(() => (store?.profile?.menus ?? []).map((m) => ({ name: m.name, description: m.description ?? '' })));
  const [services, setServices] = useState(() => ({
    delivery: !!store?.profile?.delivery, takeout: !!store?.profile?.takeout, dineIn: !!store?.profile?.dineIn,
  }));
  const [hours, setHours] = useState(store?.profile?.hours ?? '');
  const [place, setPlace] = useState(store?.profile?.place ?? null);
  const [samples, setSamples] = useState(() => padSamples(store?.sampleReplies ?? []));
  const [tone, setTone] = useState(store?.toneProfile ?? null); // 적용할 말투 (고칠 수 있음)
  const [learned, setLearned] = useState(store?.toneProfile ?? null); // 예시 답글에서 배운 그대로
  const [settings, setSettings] = useState(store?.replySettings ?? DEFAULT_SETTINGS);
  const [newPhrase, setNewPhrase] = useState('');
  const [fresh, setFresh] = useState(false); // 이번에 새로 학습해 아직 저장 전인지 (아니면 기준은 저장된 값)
  const [busy, setBusy] = useState(null); // 'store' | 'learn' | 'style'
  const [error, setError] = useState(null);
  const [nameError, setNameError] = useState(null);
  const nameRef = useRef(null);
  const learnRef = useRef(null);

  const filled = samples.map((s) => s.trim()).filter(Boolean);
  const sampleReady = filled.length >= MIN_SAMPLES;
  const savedSamples = store?.sampleReplies ?? [];
  const learnedAll = !!store?.toneProfile;
  const profile = cleanProfile({ menus, ...services, hours, place });
  // 설명만 있고 이름이 빈 메뉴: 저장되지 않으므로 바뀐 것으로 보고, 저장할 때 이름을 넣으라고 알린다
  const namelessMenu = menus.findIndex((m) => !m.name.trim() && m.description.trim());
  const storeDirty = !!store && (name.trim() !== store.name || category !== store.category || info.trim() !== (store.info ?? '')
    || !same(profile, cleanProfile(store.profile)) || namelessMenu >= 0);
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
    if (namelessMenu >= 0) {
      setError(`메뉴 ${namelessMenu + 1}의 이름을 입력하십시오. 설명만 있는 메뉴는 저장할 수 없습니다.`);
      document.getElementById(`menuName${namelessMenu}`)?.focus();
      return;
    }
    setBusy('store');
    setError(null);
    try {
      const body = { name: name.trim(), category, info: info.trim(), profile };
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
      setFresh(true);
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
      setLearned(saved.toneProfile ?? null);
      setFresh(false);
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
    setFresh(false);
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
          <p>답글에 들어갈 매장 이름·업종과 메뉴·운영 방식입니다.</p>
        </div>
        <form className="sp-panel" onSubmit={saveStore} noValidate>
          <div className="sp-body store-cols">
            <fieldset className="store-sec">
              <legend>기본 정보</legend>
              <PlaceSearch onPick={(p) => {
                setName(p.name);
                if (CATEGORIES.includes(p.category)) setCategory(p.category);
                setPlace({ id: p.id, address: p.address, url: p.url });
                if (nameError) setNameError(null);
              }} />
              {place && (
                <div className="place-linked">
                  <Icon name="confirm" size={16} />
                  <div className="place-linked-text">
                    <strong>카카오맵 장소 연결됨</strong>
                    {place.address && <span>{place.address}</span>}
                  </div>
                  {KAKAO_PLACE_URL.test(place.url) && (
                    <a href={place.url} target="_blank" rel="noopener noreferrer">카카오맵에서 보기</a>
                  )}
                  <button type="button" className="text-link" onClick={() => setPlace(null)}>연결 끊기</button>
                </div>
              )}
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
            </fieldset>

            <fieldset className="store-sec">
              <legend>메뉴와 운영 <span>(선택)</span></legend>
              <p className="hint">
                지도에는 메뉴·영업시간이 없어 직접 적습니다. 리뷰가 그 메뉴나 배달·영업시간을 말할 때만 답글에 덧붙이고, 다른 메뉴를 홍보하지는 않습니다.
              </p>
              <div className="field-group">
                <span className="label">대표 메뉴</span>
                {menus.length > 0 && (
                  <ul className="menu-rows">
                    {menus.map((m, i) => (
                      <li key={i}>
                        <FormInput id={`menuName${i}`} label={`메뉴 ${i + 1} 이름`} hideLabel value={m.name} maxLength={30}
                                   placeholder="메뉴 이름 (예: 바닐라 라떼)"
                                   onChange={(e) => setMenus(menus.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                        <FormInput id={`menuDesc${i}`} label={`메뉴 ${i + 1} 설명`} hideLabel value={m.description} maxLength={100}
                                   placeholder="한 줄 설명 (예: 바닐라빈 시럽을 직접 만듭니다)"
                                   onChange={(e) => setMenus(menus.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                        <IconButton icon="delete" tone="danger" size="sm" label={`메뉴 ${i + 1} 삭제`}
                                    onClick={() => setMenus(menus.filter((_, j) => j !== i))} />
                      </li>
                    ))}
                  </ul>
                )}
                {menus.length < MAX_MENUS && (
                  <button type="button" className="add-row" onClick={() => setMenus([...menus, blankMenu()])}>
                    <Icon name="add" size={18} />메뉴 추가
                  </button>
                )}
              </div>
              <div className="field-group" role="group" aria-labelledby="services-label">
                <span className="label" id="services-label">이용 방법</span>
                <div className="service-chips">
                  {SERVICES.map(([key, label]) => (
                    <label key={key} className={`chip ${services[key] ? 'is-on' : ''}`}>
                      <input type="checkbox" className="sr-only" checked={services[key]}
                             onChange={(e) => setServices((s) => ({ ...s, [key]: e.target.checked }))} />
                      {services[key] && <Icon name="confirm" size={14} />}
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <FormInput id="storeHours" label="영업시간" value={hours} maxLength={100}
                         placeholder="예: 매일 11:00~21:00, 화요일 휴무"
                         onChange={(e) => setHours(e.target.value)} />
            </fieldset>
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
                <PanelHead icon="edit" title="예시 답글">
                  <span className={`sp-count ${sampleReady ? 'is-ok' : ''}`}>{filled.length} / {MAX_SAMPLES}개</span>
                </PanelHead>
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
                <PanelHead icon="sparkles" title="학습한 말투">
                  <LearnState tone={tone} learnedAll={learnedAll} fresh={fresh} dirty={toneDirty || (samplesDirty && !!tone)} />
                </PanelHead>
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
                      <p className="hint">{fresh ? '예시 답글에서 배운 값입니다. 바꾸면 그 값으로 답글을 씁니다.' : '저장된 말투입니다. 바로 고치거나 예시 답글로 다시 학습할 수 있습니다.'}</p>
                      <div className="style-rows">
                        <OptionRow label="존댓말 수준" learned={learned.formality} fresh={fresh}
                                   value={tone.formality} options={FORMALITIES.map((v) => [v, v])}
                                   onChange={(v) => updateTone({ formality: v })} />
                        <OptionRow label="이모지 사용" learned={learned.emojiLevel} fresh={fresh} wordMap={{ 없음: '쓰지 않음' }}
                                   hint={learned.emojiExamples?.length ? `자주 쓴 이모지 ${learned.emojiExamples.join(' ')}` : null}
                                   value={tone.emojiLevel} options={EMOJI_LEVELS.map((v) => [v, v === '없음' ? '쓰지 않음' : v])}
                                   onChange={(v) => updateTone({ emojiLevel: v })} />
                        <OptionRow label="답글 길이" learned={learned.length} fresh={fresh}
                                   value={tone.length} options={LENGTHS.map((v) => [v, v])}
                                   onChange={(v) => updateTone({ length: v })} />
                        <div className="option-row">
                          <div className="option-row-text">
                            <label className="option-row-label" htmlFor="newPhrase">자주 쓰는 표현</label>
                            <span className="hint">{tone.phrases.length ? '답글에 자연스럽게 섞어 씁니다. 최대 8개.' : '예시 답글에서 찾지 못했습니다. 직접 넣을 수 있습니다.'}</span>
                          </div>
                          {tone.phrases.length > 0 && (
                            <div className="tags">
                              {tone.phrases.map((p) => (
                                <span className="tag" key={p}>
                                  {p}
                                  <IconButton icon="remove" size="sm" tone="danger" label={`${p} 삭제`}
                                              onClick={() => updateTone({ phrases: tone.phrases.filter((x) => x !== p) })} />
                                </span>
                              ))}
                            </div>
                          )}
                          {tone.phrases.length < 8 && (
                            <div className="inline-add">
                              <FormInput id="newPhrase" label="표현 추가" hideLabel placeholder="표현 입력 후 Enter" value={newPhrase}
                                         onChange={(e) => setNewPhrase(e.target.value)}
                                         onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); addPhrase(); } }} />
                              <SecondaryButton tone="neutral" icon="add" onClick={addPhrase} disabled={!newPhrase.trim()}>추가</SecondaryButton>
                            </div>
                          )}
                        </div>
                        <div className="option-row">
                          <div className="option-row-text">
                            <label className="option-row-label" htmlFor="closing">마무리 인사</label>
                            <span className="hint">비우면 정해진 인사 없이 리뷰에 맞춰 끝맺습니다.</span>
                          </div>
                          <FormInput id="closing" label="마무리 인사" hideLabel value={tone.closing} placeholder="예: 오늘도 좋은 하루 되세요!"
                                     onChange={(e) => updateTone({ closing: e.target.value })} />
                        </div>
                      </div>
                      <div className="learn-actions">
                        {!same(tone, learned)
                          ? <button type="button" className="text-link" onClick={() => setTone(learned)}><Icon name="restore" size={15} />{fresh ? '학습한 값으로 되돌리기' : '저장된 값으로 되돌리기'}</button>
                          : <span />}
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
                <PanelHead icon="chat" title="학습 결과 미리보기"
                           desc="사장님 답글과, 배운 말투로 쓴 예시 답글을 비교합니다. 말투를 고치면 예시 답글이 바로 바뀝니다." />
                <div className="sp-body compare-cols">
                  <figure className="compare-card">
                    <figcaption><Icon name="user" size={15} />사장님 예시 답글</figcaption>
                    <blockquote>{filled[0] ?? '예시 답글이 없습니다.'}</blockquote>
                  </figure>
                  <figure className="compare-card is-ai">
                    <figcaption><Icon name="sparkles" size={15} />배운 말투로 쓴 예시</figcaption>
                    <div className="pv-review">
                      <span className="pv-who">
                        예시 리뷰
                        <span className="star-row" role="img" aria-label="별점 5점">
                          {[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" size={13} className="is-on" />)}
                        </span>
                      </span>
                      <p>{SAMPLE_REVIEW}</p>
                    </div>
                    <div className="pv-reply">
                      <span className="pv-who"><Icon name="store" size={14} />{store.name} 답글</span>
                      <blockquote>
                        {markParts(previewText(tone), [...tone.phrases, tone.closing]).map((p, i) => (
                          p.mark ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>
                        ))}
                      </blockquote>
                    </div>
                    <p className="hint">
                      <mark>밑줄</mark>은 자주 쓰는 표현과 마무리 인사입니다. 실제 답글은 리뷰 내용에 맞춰 새로 씁니다.
                    </p>
                  </figure>
                </div>
              </div>
            )}

            {/* 답글 기본 설정 */}
            <div className="sp-panel">
              <PanelHead icon="settings" title="답글 기본 설정" desc="답글 초안을 만들 때 기본으로 적용합니다." />
              <div className="sp-body defaults">
                <OptionRow label="기본 답글 유형" hint="오늘의 리뷰와 일괄 처리에서 먼저 보여줄 말투입니다."
                           value={settings.defaultTone} options={DEFAULT_TONES}
                           onChange={(v) => setSettings((x) => ({ ...x, defaultTone: v }))} />
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

/** 패널 제목 줄: 아이콘 + 제목(+설명) + 오른쪽 상태 */
function PanelHead({ icon, title, desc, children }) {
  return (
    <div className="sp-head">
      <span className="sp-icon"><Icon name={icon} size={18} /></span>
      <div className="sp-title">
        <h3>{title}</h3>
        {desc && <p>{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function SaveState({ dirty, saved, at }) {
  if (dirty) return <span className="save-state is-dirty"><i aria-hidden="true" />저장하지 않은 변경</span>;
  if (saved) return <span className="save-state is-saved"><Icon name="confirm" size={15} />저장됨{at ? ` ${formatDateTime(at)}` : ''}</span>;
  return <span className="save-state">아직 등록하지 않았습니다</span>;
}

function LearnState({ tone, learnedAll, fresh, dirty }) {
  if (!tone) return <span className="learn-state">학습 전</span>;
  if (learnedAll && !fresh && dirty) return <span className="learn-state is-pending"><i aria-hidden="true" />고친 내용 저장 전</span>;
  if (dirty || !learnedAll) return <span className="learn-state is-pending"><i aria-hidden="true" />학습 완료, 저장 전</span>;
  return <span className="learn-state is-done"><Icon name="confirm" size={14} />학습 완료</span>;
}

/** 라디오처럼 하나만 고르는 줄 (세그먼트) */
function OptionRow({ label, hint, value, options, onChange, disabled, learned, wordMap, fresh }) {
  const id = `opt-${label}`;
  const changed = learned != null && value !== learned;
  return (
    <div className="option-row">
      <div className="option-row-text">
        <span className="option-row-label" id={id}>
          {label}
          {learned != null && (changed
            ? <span className="learned-tag is-changed">바꿈, {fresh ? '학습한' : '저장된'} 값은 {wordMap?.[learned] ?? learned}</span>
            : <span className="learned-tag">{fresh ? '학습한 값' : '저장된 값'}</span>)}
        </span>
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
