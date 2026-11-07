// 로그인·회원가입·이메일 인증·비밀번호 찾기/재설정·약관 화면.
// 로그인하지 않은 상태에서도 볼 수 있는 화면만 모았다.
import { useEffect, useRef, useState } from 'react';
import { auth } from '../api.js';
import Icon from '../components/Icon.jsx';
import Mascot, { BrandLogo } from '../components/Mascot.jsx';
import { Alert, FormInput, PrimaryButton, SecondaryButton } from '../components/ui.jsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordProblem = (pw) =>
  pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw) ? '8자 이상, 영문과 숫자를 모두 포함하십시오.' : null;

/**
 * 로그인 계열 화면. 넓은 화면: 왼쪽 브랜드(로고·마스코트·하는 일), 오른쪽 입력 폼.
 * 좁은 화면: 로고와 폼만. pose 를 주면 카드 위에 상태를 알려주는 마스코트를 둔다 (완료·안내 화면).
 */
function AuthCard({ title, description, children, footer, pose, brand = true }) {
  return (
    <div className={`auth ${brand ? 'has-brand' : ''}`}>
      {brand && (
        <aside className="auth-brand-panel" aria-hidden="true">
          <BrandLogo size={40} className="auth-brand-logo" />
          <div className="auth-brand-body">
            <Mascot pose="hero" size={168} className="auth-brand-mascot" />
            <p className="auth-brand-line">리뷰 답글, 사장님 말투 그대로 빠르게</p>
            <ul className="auth-brand-points">
              <li><Icon name="input" size={18} />배달앱 리뷰를 붙여 넣으면 유형을 나눠요</li>
              <li><Icon name="sparkles" size={18} />매장 말투로 답글 초안 3개를 만들어요</li>
              <li><Icon name="report" size={18} />한 주의 불만 주제를 정리해 드려요</li>
            </ul>
          </div>
          <p className="auth-brand-foot">답글은 사장님이 확인한 뒤 직접 게시합니다.</p>
        </aside>
      )}
      <div className="auth-col">
        <BrandLogo size={40} className="auth-brand" />
        <section className="auth-card">
          {pose && <Mascot pose={pose} size={84} className="auth-card-mascot" />}
          <div className="auth-head">
            <h1>{title}</h1>
            {description && <p>{description}</p>}
          </div>
          {children}
        </section>
        {footer && <div className="auth-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** 비밀번호 조건을 입력하면서 바로 확인 */
function PasswordRules({ value }) {
  const rules = [
    ['8자 이상', value.length >= 8],
    ['영문 포함', /[A-Za-z]/.test(value)],
    ['숫자 포함', /\d/.test(value)],
  ];
  return (
    <ul className="pw-rules" aria-label="비밀번호 조건">
      {rules.map(([label, ok]) => (
        <li key={label} className={ok ? 'is-ok' : ''}>
          <Icon name={ok ? 'confirm' : 'remove'} size={14} />{label}
          <span className="sr-only">{ok ? ' 충족' : ' 미충족'}</span>
        </li>
      ))}
    </ul>
  );
}

/** 메일 설정이 없을 때의 안내 (사장님이 아니라 서비스 운영자가 해결할 문제) */
function errorText(e) {
  if (e.code === 'MAIL_NOT_CONFIGURED') {
    return '메일 발송 설정이 아직 없어 인증 메일을 보낼 수 없습니다. 운영자가 backend/.env 의 MAIL_* 값을 채운 뒤 다시 시도하십시오.';
  }
  return e.message;
}

export function LoginPage({ onLoggedIn, notice }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setUnverified(false);
    setResent(null);
    const next = {};
    if (!email.trim()) next.email = '이메일을 입력하십시오.';
    else if (!EMAIL_RE.test(email.trim())) next.email = '이메일 형식이 올바르지 않습니다.';
    if (!password) next.password = '비밀번호를 입력하십시오.';
    setFieldErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const me = await auth.login(email.trim(), password, remember);
      onLoggedIn(me);
    } catch (err) {
      setError(errorText(err));
      setUnverified(err.code === 'EMAIL_NOT_VERIFIED');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    try {
      const r = await auth.resendVerification(email.trim());
      setResent(r.message);
    } catch (err) {
      setResent(errorText(err));
    }
  }

  return (
    <AuthCard
      title="로그인"
      description="다시 오신 걸 환영해요. 매장의 리뷰와 답글은 로그인한 계정에만 보입니다."
      footer={<>아직 계정이 없으신가요? <a href="#signup">회원가입</a></>}
    >
      {notice && <p className="notice notice-info"><Icon name="info" size={16} />{notice}</p>}
      <form className="auth-form" onSubmit={submit} noValidate>
        <FormInput label="이메일" type="email" autoComplete="email" value={email} error={fieldErrors.email}
                   placeholder="owner@example.com" onChange={(e) => setEmail(e.target.value)} />
        <FormInput label="비밀번호" type="password" autoComplete="current-password" value={password} error={fieldErrors.password}
                   onChange={(e) => setPassword(e.target.value)} />
        <div className="auth-row">
          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            로그인 상태 유지 (14일)
          </label>
          <a className="auth-link" href="#forgot">비밀번호 찾기</a>
        </div>
        {error && <Alert>{error}</Alert>}
        {unverified && (
          <div className="auth-resend">
            <SecondaryButton tone="neutral" size="sm" icon="mail" onClick={resend}>인증 메일 다시 받기</SecondaryButton>
            {resent && <span className="hint">{resent}</span>}
          </div>
        )}
        <PrimaryButton type="submit" loading={busy} loadingText="로그인 중" className="auth-submit">로그인</PrimaryButton>
      </form>
      <p className="hint auth-hint">공용 PC에서는 '로그인 상태 유지'를 끄십시오.</p>
    </AuthCard>
  );
}

export function SignupPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', passwordConfirm: '' });
  const [touched, setTouched] = useState({});
  const [agree, setAgree] = useState({ terms: false, privacy: false });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState(null);
  const [resent, setResent] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError(null);
    const next = validate(true);
    setTouched({ name: true, email: true, password: true, passwordConfirm: true });
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await auth.signup({ ...form, name: form.name.trim(), email: form.email.trim(), agreeTerms: agree.terms, agreePrivacy: agree.privacy });
      setSentTo(form.email.trim());
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  // 칸을 떠날 때와 제출할 때 확인한다 (입력 중에는 방해하지 않음)
  function validate(all) {
    const next = {};
    const t = all ? { name: true, email: true, password: true, passwordConfirm: true } : touched;
    if (t.name && !form.name.trim()) next.name = '이름을 입력하십시오.';
    if (t.email && !EMAIL_RE.test(form.email.trim())) next.email = '이메일 형식이 올바르지 않습니다. 예: owner@example.com';
    if (t.password && passwordProblem(form.password)) next.password = passwordProblem(form.password);
    if (t.passwordConfirm && form.passwordConfirm && form.password !== form.passwordConfirm) next.passwordConfirm = '비밀번호 확인이 일치하지 않습니다.';
    if (t.passwordConfirm && !form.passwordConfirm) next.passwordConfirm = '비밀번호를 한 번 더 입력하십시오.';
    if (all && (!agree.terms || !agree.privacy)) next.agree = '이용약관과 개인정보 처리방침에 동의해야 가입할 수 있습니다.';
    return next;
  }
  const blur = (k) => () => {
    setTouched((t) => ({ ...t, [k]: true }));
  };
  useEffect(() => {
    setErrors((e) => ({ ...validate(false), ...(e.agree && !(agree.terms && agree.privacy) ? { agree: e.agree } : {}) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touched, form, agree]);

  if (sentTo) {
    return (
      <AuthCard title="인증 메일을 보냈어요" description={`${sentTo} 메일함에서 인증 링크를 누르면 가입이 끝나요.`}
                footer={<a href="#login">로그인 화면으로</a>} pose="writing">
        <ul className="auth-steps">
          <li>링크는 24시간 동안 유효합니다.</li>
          <li>메일이 보이지 않으면 스팸함을 확인하십시오.</li>
          <li>인증을 마치고 로그인하면 매장 설정으로 이동합니다.</li>
        </ul>
        <div className="auth-resend">
          <SecondaryButton tone="neutral" size="sm" icon="mail"
                           onClick={async () => {
                             try {
                               setResent((await auth.resendVerification(sentTo)).message);
                             } catch (err) {
                               setResent(errorText(err));
                             }
                           }}>
            인증 메일 다시 받기
          </SecondaryButton>
          {resent && <span className="hint">{resent}</span>}
        </div>
      </AuthCard>
    );
  }

  const allAgreed = agree.terms && agree.privacy;
  return (
    <AuthCard title="회원가입" description="이메일 인증을 마치면 바로 매장 설정을 시작할 수 있습니다."
              footer={<>이미 계정이 있으신가요? <a href="#login">로그인</a></>}>
      <form className="auth-form" onSubmit={submit} noValidate>
        <FormInput label="이름" autoComplete="name" value={form.name} onChange={set('name')} onBlur={blur('name')}
                   error={errors.name} maxLength={30} placeholder="예: 김서준" />
        <FormInput label="이메일" type="email" autoComplete="email" value={form.email} onChange={set('email')} onBlur={blur('email')}
                   error={errors.email} placeholder="owner@example.com" />
        <div className="field-group">
          <FormInput label="비밀번호" type="password" autoComplete="new-password" value={form.password} onChange={set('password')}
                     onBlur={blur('password')} error={errors.password} maxLength={64} />
          <PasswordRules value={form.password} />
        </div>
        <FormInput label="비밀번호 확인" type="password" autoComplete="new-password" value={form.passwordConfirm}
                   onChange={set('passwordConfirm')} onBlur={blur('passwordConfirm')} error={errors.passwordConfirm} maxLength={64}
                   hint={form.passwordConfirm && form.password === form.passwordConfirm ? '비밀번호가 일치합니다.' : undefined} />
        <fieldset className="agree">
          <legend className="sr-only">약관 동의</legend>
          <label className="check agree-all">
            <input type="checkbox" checked={allAgreed}
                   onChange={(e) => setAgree({ terms: e.target.checked, privacy: e.target.checked })} />
            전체 동의
          </label>
          <div className="agree-item">
            <label className="check">
              <input type="checkbox" checked={agree.terms} onChange={(e) => setAgree((a) => ({ ...a, terms: e.target.checked }))} />
              (필수) 서비스 이용약관 동의
            </label>
            <a className="auth-link" href="#terms" target="_blank" rel="noreferrer">보기</a>
          </div>
          <div className="agree-item">
            <label className="check">
              <input type="checkbox" checked={agree.privacy}
                     onChange={(e) => setAgree((a) => ({ ...a, privacy: e.target.checked }))} />
              (필수) 개인정보 수집·이용 동의
            </label>
            <a className="auth-link" href="#privacy" target="_blank" rel="noreferrer">보기</a>
          </div>
          {errors.agree && <p className="field-error" role="alert"><Icon name="error" size={16} />{errors.agree}</p>}
        </fieldset>
        {error && <Alert>{error}</Alert>}
        <PrimaryButton type="submit" loading={busy} loadingText="가입 중" className="auth-submit">회원가입</PrimaryButton>
        <p className="hint auth-hint">가입하면 인증 메일을 보내 드립니다. 인증을 마치면 바로 매장 정보를 등록할 수 있어요.</p>
      </form>
    </AuthCard>
  );
}

export function VerifyPage({ token }) {
  const [state, setState] = useState({ status: 'loading' });
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; // StrictMode 에서 두 번 부르면 두 번째는 '이미 사용한 링크'가 된다
    started.current = true;
    if (!token) {
      setState({ status: 'error', message: '인증 링크가 올바르지 않습니다.' });
      return;
    }
    auth.verify(token)
      .then((r) => setState({ status: 'done', message: r.message }))
      .catch((e) => setState({ status: 'error', message: e.message }));
  }, [token]);

  if (state.status === 'loading') return <AuthCard title="이메일 인증 중" description="잠시만 기다리십시오." pose="analyzing" />;
  if (state.status === 'error') {
    return (
      <AuthCard title="인증하지 못했습니다" description={state.message} pose="help" footer={<a href="#login">로그인 화면으로</a>}>
        <PrimaryButton className="auth-submit" onClick={() => { window.location.hash = 'login'; }}>로그인 화면에서 인증 메일 다시 받기</PrimaryButton>
      </AuthCard>
    );
  }
  // 가입 완료: 환영 + 다음에 할 일 (실제 순서)
  return (
    <AuthCard title="가입을 환영해요!" description="이메일 인증까지 끝났어요. 로그인하면 바로 매장 설정으로 이어집니다." pose="happy">
      <ol className="welcome-steps">
        <li><strong>매장 정보 등록</strong><span>매장 이름과 업종을 적어요</span></li>
        <li><strong>예시 답글 3개</strong><span>평소 쓰던 답글로 말투를 배워요</span></li>
        <li><strong>리뷰 입력</strong><span>리뷰를 붙여 넣고 답글 초안을 받아요</span></li>
      </ol>
      <PrimaryButton icon="store" className="auth-submit" onClick={() => { window.location.hash = 'login'; }}>
        로그인하고 매장 정보 등록하기
      </PrimaryButton>
    </AuthCard>
  );
}

export function ForgotPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(email.trim())) {
      setError('이메일 형식이 올바르지 않습니다.');
      return;
    }
    setBusy(true);
    try {
      setDone((await auth.requestReset(email.trim())).message);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title={done ? '재설정 메일을 보냈어요' : '비밀번호 재설정'}
              description={done ? `${email.trim()} 메일함에서 링크를 눌러 새 비밀번호를 정하십시오.` : '가입한 이메일을 입력하면 비밀번호를 다시 정할 수 있는 링크를 보내 드립니다.'}
              footer={<a href="#login">로그인 화면으로</a>} pose={done ? 'writing' : undefined}>
      {done ? (
        <>
          <ul className="auth-steps">
            <li>링크는 30분 동안 한 번만 쓸 수 있습니다.</li>
            <li>메일이 보이지 않으면 스팸함을 확인하십시오.</li>
            <li>가입하지 않은 이메일이면 메일이 가지 않습니다.</li>
          </ul>
          <SecondaryButton tone="neutral" icon="retry" onClick={() => setDone(null)}>다른 이메일로 다시 받기</SecondaryButton>
        </>
      ) : (
        <form className="auth-form" onSubmit={submit} noValidate>
          <FormInput label="이메일" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && <Alert>{error}</Alert>}
          <PrimaryButton type="submit" loading={busy} loadingText="보내는 중" className="auth-submit">재설정 메일 받기</PrimaryButton>
        </form>
      )}
    </AuthCard>
  );
}

export function ResetPage({ token }) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    const next = {};
    const p = passwordProblem(pw);
    if (p) next.pw = p;
    if (pw !== confirm) next.confirm = '비밀번호 확인이 일치하지 않습니다.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await auth.confirmReset(token, pw, confirm);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthCard title="비밀번호를 바꿨어요" description="새 비밀번호로 로그인하십시오." pose="done">
        <PrimaryButton className="auth-submit" onClick={() => { window.location.hash = 'login'; }}>로그인하기</PrimaryButton>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="새 비밀번호 설정" description="링크는 30분 동안 한 번만 쓸 수 있습니다." footer={<a href="#login">로그인 화면으로</a>}>
      <form className="auth-form" onSubmit={submit} noValidate>
        <FormInput label="새 비밀번호" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)}
                   error={errors.pw} hint="8자 이상, 영문과 숫자를 모두 포함" maxLength={64} />
        <FormInput label="새 비밀번호 확인" type="password" autoComplete="new-password" value={confirm}
                   onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} maxLength={64} />
        {error && <Alert>{error}</Alert>}
        <PrimaryButton type="submit" loading={busy} loadingText="저장 중" className="auth-submit" disabled={!token}>
          비밀번호 변경
        </PrimaryButton>
      </form>
    </AuthCard>
  );
}

const TERMS = [
  ['서비스 내용', 'ReplyBoss는 사장님이 직접 입력한 리뷰를 분류하고 답글 초안을 만들어 주는 도구입니다. 배달앱·지도 등 외부 플랫폼에 리뷰를 가져오거나 답글을 게시하지 않으며, 최종 답글은 사장님이 직접 확인하고 게시합니다.'],
  ['AI 초안의 한계', 'AI가 만든 답글 초안은 사실과 다르거나 어색할 수 있습니다. 게시 전 내용을 확인할 책임은 사장님에게 있습니다.'],
  ['계정', '이메일 인증을 마친 계정만 이용할 수 있습니다. 비밀번호는 본인만 알도록 관리하십시오.'],
  ['금지 행위', '다른 사람의 계정을 쓰거나, 서비스에 과도한 요청을 보내거나, 타인의 개인정보를 무단으로 입력하는 행위를 금지합니다.'],
  ['탈퇴', '매장 설정 화면 맨 아래에서 언제든 탈퇴할 수 있으며, 탈퇴하면 계정과 모든 데이터가 즉시 삭제됩니다.'],
];
const PRIVACY = [
  ['수집 항목', '이메일, 비밀번호(암호화해 저장, 원래 값은 저장하지 않음), 매장명·업종·매장 소개, 예시 답글, 입력한 리뷰(개인정보를 가린 문장만 저장), 답글 초안과 피드백, 고객 문의 내용과 첨부 이미지, 접속 기록(로그인 유지 쿠키).'],
  ['이용 목적', '로그인과 본인 확인, 답글 초안 작성, 주간 리포트, 고객 문의 응대, 서비스 품질 개선.'],
  ['처리 위탁', '리뷰 분류·답글 작성·도우미 답변을 위해 개인정보를 가린 문장을 OpenAI API로 보냅니다. 인증·안내 메일은 운영자가 설정한 메일 서버(예: Gmail SMTP)로 보냅니다.'],
  ['보관 기간', '탈퇴할 때까지 보관하고, 탈퇴하면 즉시 삭제합니다. 인증·재설정 링크는 각각 24시간·30분 뒤 쓸 수 없습니다.'],
  ['이용자 권리', '언제든 매장 설정에서 정보를 고치거나 탈퇴할 수 있고, 고객 지원 메뉴로 문의할 수 있습니다.'],
];

export function LegalPage({ kind }) {
  const items = kind === 'terms' ? TERMS : PRIVACY;
  return (
    <AuthCard
      brand={false}
      title={kind === 'terms' ? '서비스 이용약관' : '개인정보 처리방침'}
      description="수업 프로젝트용 초안입니다. 실제 서비스로 운영하려면 법률 검토가 필요합니다."
      footer={<a href="#signup">회원가입으로</a>}
    >
      <ol className="legal">
        {items.map(([title, body]) => (
          <li key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </li>
        ))}
      </ol>
    </AuthCard>
  );
}
