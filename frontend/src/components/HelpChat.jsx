// ReplyBoss 도우미: 자주 묻는 질문을 근거로 안내하고, 해결이 안 되면 문의 접수로 연결한다.
// 대화는 서버에 저장하지 않는다 (창을 닫았다 열어도 이 탭에서만 유지).
import { useEffect, useRef, useState } from 'react';
import { support } from '../api.js';
import Icon from './Icon.jsx';
import Spinner from './Spinner.jsx';
import Mascot from './Mascot.jsx';
import { supportLink } from '../pages/Support.jsx';

const GREETING = {
  role: 'assistant',
  text: '안녕하세요! ReplyBoss 도우미입니다. 서비스 이용 중 궁금한 점이나 문제가 있으신가요?',
};
const SUGGESTIONS = ['AI 답글이 생성되지 않아요', '인증 메일이 안 와요', '작성 완료하면 배달앱에 올라가나요?'];

export default function HelpChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [faqs, setFaqs] = useState({});
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open || Object.keys(faqs).length) return;
    support.faq()
      .then((items) => setFaqs(Object.fromEntries(items.map((f) => [f.id, f.question]))))
      .catch(() => {});
  }, [open, faqs]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, busy, open]);

  useEffect(() => {
    if (!open) return undefined;
    inputRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function send(text) {
    const message = text.trim();
    if (!message || busy) return;
    const history = messages.filter((m) => m !== GREETING && !m.error).slice(-6).map(({ role, text: t }) => ({ role, text: t }));
    setMessages((m) => [...m, { role: 'user', text: message }]);
    setInput('');
    setBusy(true);
    try {
      const r = await support.ask(message.slice(0, 500), history);
      setMessages((m) => [...m, { role: 'assistant', text: r.answer, faqIds: r.faqIds, suggestInquiry: r.suggestInquiry,
        inquiryType: r.inquiryType, source: r.source }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', error: true, suggestInquiry: true, inquiryType: 'BUG',
        text: `답변을 가져오지 못했어요. ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  function openInquiry(type) {
    // 발생 위치는 지금 보고 있던 화면으로 자동 기록된다
    window.location.hash = supportLink({ type: type ?? 'GENERAL' }).slice(1);
    setOpen(false);
  }

  return (
    <div className="helpchat">
      {open && (
        <section className="helpchat-panel" role="dialog" aria-label="ReplyBoss 도우미">
          <header className="helpchat-head">
            <Mascot pose="hello" size={44} className="helpchat-avatar" />
            <div className="helpchat-title">
              <strong>ReplyBoss 도우미</strong>
              <p className="hint">자주 묻는 질문을 바탕으로 안내합니다</p>
            </div>
            <button type="button" className="icon-btn" aria-label="도우미 닫기" onClick={() => setOpen(false)}>
              <Icon name="remove" />
            </button>
          </header>
          <div className="helpchat-list" ref={listRef} aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={`bubble bubble-${m.role} ${m.error ? 'is-error' : ''}`}>
                <p>{m.text}</p>
                {m.faqIds?.length > 0 && (
                  <ul className="bubble-faq">
                    {m.faqIds.filter((id) => faqs[id]).map((id) => (
                      <li key={id}><a href="#support/faq" onClick={() => setOpen(false)}>{faqs[id]}</a></li>
                    ))}
                  </ul>
                )}
                {m.suggestInquiry && (
                  <button type="button" className="bubble-cta" onClick={() => openInquiry(m.inquiryType)}>
                    {m.inquiryType === 'BUG' ? '오류 제보 접수하기' : m.inquiryType === 'SUGGESTION' ? '개선 제안 남기기' : '문의 접수하기'}
                    <Icon name="go" size={14} />
                  </button>
                )}
                {m.source && (
                  <span className="bubble-source">{m.source === 'AI' ? 'AI 안내 · 자주 묻는 질문 기반' : '자주 묻는 질문 검색 결과'}</span>
                )}
              </div>
            ))}
            {messages.length === 1 && (
              <div className="helpchat-suggest">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="chip" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            )}
            {busy && (
              <div className="bubble bubble-assistant is-typing"><Spinner /> 답변을 찾는 중…</div>
            )}
          </div>
          <form className="helpchat-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <input ref={inputRef} className="input" value={input} maxLength={500} placeholder="궁금한 점을 입력하십시오"
                   aria-label="도우미에게 질문" onChange={(e) => setInput(e.target.value)} />
            <button type="submit" className="icon-btn helpchat-send" aria-label="보내기" disabled={busy || !input.trim()}>
              <Icon name="send" />
            </button>
          </form>
          <p className="helpchat-note">계정·데이터 확인이 필요한 문제는 담당자가 확인하도록 문의를 남겨 주십시오.</p>
        </section>
      )}
      <button type="button" className="helpchat-fab" aria-expanded={open} aria-label={open ? '도우미 닫기' : '도우미 열기'}
              onClick={() => setOpen((v) => !v)}>
        <Icon name={open ? 'remove' : 'chat'} size={22} />
        {!open && <span>도우미</span>}
      </button>
    </div>
  );
}
