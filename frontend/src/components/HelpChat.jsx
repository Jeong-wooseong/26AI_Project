// ReplyBoss 도우미: 자주 묻는 질문을 근거로 안내하고, 해결이 안 되면 문의 접수로 연결한다.
// 대화는 서버에 저장하지 않는다 (창을 닫았다 열어도 이 탭에서만 유지).
import { useEffect, useRef, useState } from 'react';
import { recentErrorCode, support } from '../api.js';
import Icon from './Icon.jsx';
import Spinner from './Spinner.jsx';
import Mascot from './Mascot.jsx';
import { supportLink } from '../pages/Support.jsx';

const GREETING = {
  role: 'assistant',
  text: '안녕하세요! ReplyBoss 도우미입니다. 서비스 이용 중 궁금한 점이나 문제가 있으신가요?',
};
function offlineHelp() {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return [
    offline
      ? '지금 이 기기의 인터넷 연결이 끊겨 있어요. 인터넷이 없으면 리뷰 분류, 답글 생성, 저장이 모두 되지 않아요.'
      : 'ReplyBoss 서버에 연결할 수 없어요. 인터넷 연결이 불안정하거나 서버가 잠시 멈췄을 수 있어요.',
    '1. 와이파이나 인터넷이 연결되어 있는지, 다른 사이트가 열리는지 확인해 주세요.',
    '2. 매장·회사 와이파이가 막혀 있으면 휴대폰 데이터 등 다른 네트워크로 시도해 주세요.',
    '3. 새로고침(F5)한 뒤 다시 시도해 주세요. 연결이 끊긴 동안 입력한 내용은 저장되지 않았을 수 있어요.',
    '연결이 돌아왔는데도 계속되면 고객 지원에서 오류 제보를 남겨 주세요.',
  ].join('\n');
}

const SUGGESTIONS = ['AI 답글이 생성되지 않아요', '인터넷이 끊기면 어떻게 되나요?', '여러 리뷰를 한 번에 처리하고 싶어요'];

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
    // 지금 화면과 최근 오류 코드를 함께 보내 상황에 맞게 안내받는다 (개인정보 없음)
    const page = window.location.hash.slice(1).split('?')[0].toLowerCase().replace(/[^a-z/-]/g, '').slice(0, 40);
    const code = recentErrorCode();
    try {
      const r = await support.ask(message.slice(0, 500), history, page || undefined, code ?? undefined);
      setMessages((m) => [...m, { role: 'assistant', text: r.answer, faqIds: r.faqIds, suggestInquiry: r.suggestInquiry,
        inquiryType: r.inquiryType, source: r.source }]);
    } catch (e) {
      // 인터넷·서버 연결이 끊기면 도우미도 서버에 닿지 못하므로, 연결 문제 안내는 화면에서 바로 보여준다
      const text = e.code === 'NETWORK' ? offlineHelp() : `답변을 가져오지 못했어요. ${e.message}`;
      setMessages((m) => [...m, { role: 'assistant', error: e.code !== 'NETWORK', offline: e.code === 'NETWORK', suggestInquiry: e.code !== 'NETWORK', inquiryType: 'BUG', text }]);
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
            <Mascot pose="smile" size={44} className="helpchat-avatar" />
            <div className="helpchat-title">
              <strong>ReplyBoss 도우미</strong>
              <p className="hint">서비스 안내와 자주 묻는 질문을 바탕으로 안내합니다</p>
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
                {m.offline && <span className="bubble-source">연결 없이 화면에서 바로 보여드린 안내예요</span>}
                {m.source && (
                  <span className="bubble-source">{m.source === 'AI' ? 'AI 안내 · 서비스 안내서 기반, 틀릴 수 있어요' : '자주 묻는 질문 검색 결과'}</span>
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
