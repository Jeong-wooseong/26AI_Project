// 고객 지원: 자주 묻는 질문 · 문의하기(일반/오류/개선 제안) · 내 문의(처리 상태와 답변)
import { useEffect, useMemo, useRef, useState } from 'react';
import { support } from '../api.js';
import Icon from '../components/Icon.jsx';
import {
  Alert, EmptyState, FormInput, FormSelect, PrimaryButton, SecondaryButton,
} from '../components/ui.jsx';
import { formatDateTime } from '../components/reply/replyModel.js';
import Mascot from '../components/Mascot.jsx';

export const INQUIRY_TYPES = [
  ['GENERAL', '일반 문의', '기능이나 이용 방법에 대한 질문'],
  ['BUG', '오류 제보', '오작동이나 예상하지 못한 결과'],
  ['SUGGESTION', '기능 개선 제안', '추가되었으면 하는 기능'],
];
export const TYPE_LABEL = Object.fromEntries(INQUIRY_TYPES.map(([k, l]) => [k, l]));
export const LOCATIONS = ['매장 설정', '리뷰 입력', '오늘의 리뷰', '답글 생성', '주간 리포트', '로그인·계정', '도우미', '기타'];
export const STATUS = {
  RECEIVED: ['답변 대기', 'neutral'],
  IN_PROGRESS: ['처리 중', 'inquiry'],
  ANSWERED: ['답변 완료', 'success'],
};
/** 화면 주소 → 발생 위치 기본값 */
const LOCATION_OF = { setup: '매장 설정', input: '리뷰 입력', reviews: '오늘의 리뷰', report: '주간 리포트' };
const MAX_FILE = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
/** 접수 번호: 사장님과 담당자가 같은 번호로 이야기할 수 있게 */
export const inquiryNo = (id) => `RB-${String(id).padStart(5, '0')}`;


/** 다른 화면에서 문의 화면을 여는 주소 (오류 제보: 위치·오류 코드 자동 기록) */
export function supportLink({ type = 'BUG', location, code, from } = {}) {
  const q = new URLSearchParams({ type });
  if (location) q.set('location', location);
  if (code) q.set('code', code);
  const page = from ?? window.location.hash.slice(1).split('?')[0];
  if (page && !page.startsWith('support')) q.set('from', page);
  return `#support/new?${q}`;
}

/** 오류 안내 옆에 붙이는 '오류 제보' 링크 */
export function ReportErrorLink({ location, code }) {
  return (
    <a className="report-link" href={supportLink({ type: 'BUG', location, code })}>
      오류 제보
    </a>
  );
}

/**
 * 넓은 화면: 왼쪽 자주 묻는 질문, 오른쪽 내 문의 현황 + 새 문의. 좁은 화면은 같은 순서로 쌓는다.
 * 예전 주소(#support/new, #support/mine)로 들어오면 해당 영역으로 스크롤한다.
 */
export default function Support({ sub, params, from, toast }) {
  const [refresh, setRefresh] = useState(0); // 문의를 접수하면 내 문의 목록을 다시 불러온다
  const formRef = useRef(null);
  const mineRef = useRef(null);

  useEffect(() => {
    const el = sub === 'new' ? formRef.current : sub === 'mine' ? mineRef.current : null;
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    if (sub === 'new') el.querySelector('input:not([type=radio]), textarea')?.focus({ preventScroll: true });
  }, [sub, params]);

  function onDone() {
    setRefresh((n) => n + 1);
    window.history.replaceState(null, '', '#support/mine');
    requestAnimationFrame(() => mineRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }

  const [faqs, setFaqs] = useState(null);
  const [faqError, setFaqError] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(null);
  useEffect(() => {
    support.faq().then(setFaqs).catch((e) => setFaqError(e.message));
  }, []);
  const categories = useMemo(() => {
    const m = new Map();
    (faqs ?? []).forEach((f) => m.set(f.category, (m.get(f.category) ?? 0) + 1));
    return [...m];
  }, [faqs]);

  return (
    <>
      <section className="support-hero" aria-labelledby="support-title">
        <div className="support-hero-text">
          <h1 id="support-title">무엇을 도와드릴까요?</h1>
          <p>사용 방법을 검색해 보시고, 해결되지 않으면 문의를 남겨 주십시오. 담당자가 확인한 뒤 메일로 답변합니다.</p>
        </div>
        <FormInput icon="search" label="자주 묻는 질문 검색" hideLabel type="search" fieldClassName="support-search"
                   placeholder="궁금한 점을 검색하십시오. 예: 인증 메일, 말투, 작성 완료, 인터넷"
                   value={query} onChange={(e) => setQuery(e.target.value)} />
        <Mascot pose="smile" size={92} className="support-hero-mascot" />
      </section>

      <div className="support-layout">
        <FaqList items={faqs} error={faqError} query={query} category={category} categories={categories} onCategory={setCategory} />
        <aside className="support-side" aria-label="문의 내역과 문의 접수">
          <div ref={mineRef} className="support-anchor"><MyInquiries key={refresh} /></div>
          <div ref={formRef} className="support-anchor">
            <InquiryForm key={`${params.toString()}-${refresh}`} params={params} from={from} toast={toast} onDone={onDone} />
          </div>
        </aside>
      </div>
    </>
  );
}

function FaqList({ items, error, query, category, categories, onCategory }) {
  const [open, setOpen] = useState(null);
  const shown = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    return items.filter((f) => (!category || f.category === category)
      && (!q || [f.question, f.answer, ...(f.keywords ?? [])].some((t) => t.toLowerCase().includes(q))));
  }, [items, query, category]);

  return (
    <section className="faq-panel support-main" aria-labelledby="faq-title">
      <div className="faq-panel-head">
        <h2 id="faq-title">자주 묻는 질문</h2>
        {query.trim() && items && <span className="hint">검색 결과 {shown.length}개</span>}
      </div>
      {categories.length > 0 && (
        <div className="faq-tabs" role="group" aria-label="주제">
          <button type="button" className="type-tab" aria-pressed={!category} onClick={() => onCategory(null)}>전체</button>
          {categories.map(([c]) => (
            <button key={c} type="button" className="type-tab" aria-pressed={category === c}
                    onClick={() => onCategory(category === c ? null : c)}>
              {c}
            </button>
          ))}
        </div>
      )}
      {error && <Alert>{error}</Alert>}
      {!items && !error && <EmptyState loading description="불러오는 중…" />}
      {items && (shown.length === 0 ? (
        <div className="list-empty">
          <Mascot pose="thinking" size={64} />
          <p>찾는 내용이 없습니다. 오른쪽 아래 도우미에게 물어보거나 <a href="#support/new?type=GENERAL">문의를 남겨 주십시오</a>.</p>
        </div>
      ) : (
        <ul className={`faq ${category ? 'no-cat' : ''}`}>
          {shown.map((f) => (
            <li key={f.id} className={open === f.id ? 'is-open' : ''}>
              <button type="button" className="faq-q" aria-expanded={open === f.id} onClick={() => setOpen(open === f.id ? null : f.id)}>
                {!category && <span className="faq-cat">{f.category}</span>}
                <span className="faq-q-text">{f.question}</span>
                <Icon name="next" size={16} className="faq-chevron" />
              </button>
              {open === f.id && <p className="faq-a">{f.answer}</p>}
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
}

function InquiryForm({ params, from, toast, onDone }) {
  const initialType = INQUIRY_TYPES.some(([k]) => k === params.get('type')) ? params.get('type') : 'GENERAL';
  const fromPage = params.get('from') || from || '';
  const [form, setForm] = useState({
    type: initialType,
    title: '',
    content: '',
    location: params.get('location') || LOCATION_OF[fromPage.split('/')[0]] || '',
  });
  const errorCode = params.get('code') || '';
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function pickFile(e) {
    const f = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!f) return;
    if (!IMAGE_TYPES.includes(f.type)) {
      setErrors((x) => ({ ...x, file: 'PNG, JPG, GIF, WEBP 이미지만 첨부할 수 있습니다.' }));
      return;
    }
    if (f.size > MAX_FILE) {
      setErrors((x) => ({ ...x, file: '5MB 이하 이미지만 첨부할 수 있습니다.' }));
      return;
    }
    setErrors((x) => ({ ...x, file: null }));
    setFile(f);
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    const next = {};
    if (!form.title.trim()) next.title = '제목을 입력하십시오.';
    if (!form.content.trim()) next.content = '상세 내용을 입력하십시오.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await support.createInquiry({ ...form, pagePath: fromPage ? `#${fromPage}` : '', errorCode }, file);
      toast.show('문의를 접수했습니다. 답변이 등록되면 메일로 알려 드립니다.');
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="section inquiry-form" onSubmit={submit} noValidate aria-labelledby="inquiry-form-title">
      <div className="section-body">
        <h2 id="inquiry-form-title" className="side-title">새 문의 남기기</h2>
        <fieldset className="type-picker">
          <legend className="label">문의 유형</legend>
          <div className="type-options">
            {INQUIRY_TYPES.map(([key, label, desc]) => (
              <label key={key} className={`type-option ${form.type === key ? 'is-selected' : ''}`}>
                <input type="radio" name="inquiry-type" value={key} checked={form.type === key} onChange={set('type')} />
                <span className="type-option-label">{label}</span>
                <span className="hint">{desc}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="form-grid">
          <FormSelect label="발생 위치" value={form.location} onChange={set('location')}
                      options={[['', '선택 안 함'], ...LOCATIONS.map((l) => [l, l])]} />
          <div className="field">
            <span className="label">자동 기록</span>
            <p className="auto-record meta-row">
              <span>{fromPage ? `화면 #${fromPage}` : '화면 정보 없음'}</span>
              {errorCode && <span>오류 코드 {errorCode}</span>}
            </p>
          </div>
        </div>
        <FormInput label="제목" value={form.title} onChange={set('title')} error={errors.title} maxLength={100}
                   placeholder={form.type === 'BUG' ? '예: AI 답글 생성이 완료되지 않습니다.' : '문의 내용을 간략하게 적어 주십시오.'}
                   counter={`${form.title.length}/100`} counterInside />
        <FormInput multiline rows={6} label="상세 내용" value={form.content} onChange={set('content')} error={errors.content}
                   maxLength={3000} counter={`${form.content.length}/3000`}
                   placeholder={form.type === 'BUG'
                     ? '어떤 버튼을 눌렀을 때 어떤 일이 일어났는지 적어 주십시오.\n예: 답글 생성 버튼을 누르면 로딩 상태가 계속 유지됩니다.'
                     : '구체적인 상황을 적어 주십시오.'}
                   hint="리뷰 원문이나 고객 연락처 같은 개인정보는 적지 마십시오." />
        <div className="field">
          <span className="label">첨부 이미지 (선택)</span>
          <div className="attach-row">
            <SecondaryButton tone="neutral" size="sm" icon="attach" onClick={() => fileRef.current?.click()}>
              {file ? '다른 이미지 선택' : '이미지 선택'}
            </SecondaryButton>
            {file && (
              <span className="attach-name">
                {file.name} ({Math.ceil(file.size / 1024)}KB)
                <button type="button" className="icon-btn icon-btn-sm" aria-label="첨부 이미지 빼기" onClick={() => setFile(null)}>
                  <Icon name="remove" size={14} />
                </button>
              </span>
            )}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={pickFile} />
          </div>
          {errors.file ? (
            <p className="field-error" role="alert"><Icon name="error" size={16} />{errors.file}</p>
          ) : (
            <p className="hint">오류 화면 캡처 등 PNG·JPG·GIF·WEBP, 5MB 이하 1장</p>
          )}
        </div>
        {error && <Alert>{error}</Alert>}
      </div>
      <div className="section-foot">
        <p className="hint">답변 대기 → 처리 중 → 답변 완료 순으로 처리되며, 답변이 등록되면 메일로 알려 드립니다.</p>
        <div className="end">
          <PrimaryButton type="submit" icon="send" loading={busy} loadingText="접수 중">문의 접수</PrimaryButton>
        </div>
      </div>
    </form>
  );
}

function MyInquiries() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    support.myInquiries().then(setItems).catch((e) => setError(e.message));
  }, []);

  const counts = (items ?? []).reduce((m, q) => ({ ...m, [q.status]: (m[q.status] ?? 0) + 1 }), {});
  return (
    <section className="my-inquiries" aria-labelledby="my-inquiries-title">
      <div className="my-inquiries-head">
        <h2 id="my-inquiries-title" className="side-title">내 문의</h2>
        {items?.length > 0 && (
          <p className="my-inquiries-counts">
            <span>전체 {items.length}</span>
            {Object.entries(STATUS).map(([k, [label, tone]]) => (counts[k]
              ? <span key={k} className={`is-${tone}`}>{label} {counts[k]}</span> : null))}
          </p>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
      {!items && !error && <EmptyState loading description="불러오는 중…" />}
      {items?.length === 0 && (
        <div className="my-inquiries-empty">
          <Mascot pose="smile" size={48} />
          <p className="hint">아직 남긴 문의가 없습니다. 아래에서 문의를 남기면 처리 상태와 담당자 답변이 여기에 표시됩니다.</p>
        </div>
      )}
      {items?.length > 0 && (
        <ul className="inquiry-list">
          {items.map((q) => {
            const [label] = STATUS[q.status] ?? [q.status];
            const isOpen = open === q.id;
            return (
              <li key={q.id} className="inquiry">
                <button type="button" className="inquiry-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : q.id)}>
                  <span className="inquiry-top">
                    <span className="inquiry-no">{inquiryNo(q.id)}</span>
                    <span className={`inquiry-status is-${q.status.toLowerCase()}`}>{label}</span>
                    <span className="inquiry-date">{formatDateTime(q.createdAt)}</span>
                  </span>
                  <span className="inquiry-title"><span className="tag">{TYPE_LABEL[q.type] ?? q.type}</span>{q.title}</span>
                </button>
                {isOpen && (
                  <div className="inquiry-body">
                    <InquiryMeta q={q} />
                    <p className="inquiry-content">{q.content}</p>
                    {q.attachmentName && (
                      <a className="attach-link" href={support.attachmentUrl(q.id)} target="_blank" rel="noreferrer">
                        <Icon name="attach" size={16} />{q.attachmentName}
                      </a>
                    )}
                    {q.answer ? (
                      <div className="inquiry-answer">
                        <span className="inquiry-answer-label"><Icon name="support" size={15} />담당자 답변 {q.answeredAt && <span>{formatDateTime(q.answeredAt)}</span>}</span>
                        <p>{q.answer}</p>
                      </div>
                    ) : (
                      <p className="hint">아직 답변이 없습니다. 답변이 등록되면 메일로 알려 드립니다.</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function InquiryMeta({ q }) {
  const parts = [q.location && `위치 ${q.location}`, q.pagePath && `화면 ${q.pagePath}`, q.errorCode && `오류 코드 ${q.errorCode}`]
    .filter(Boolean);
  return parts.length ? <p className="inquiry-meta meta-row">{parts.map((t) => <span key={t}>{t}</span>)}</p> : null;
}

