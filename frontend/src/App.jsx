import { useCallback, useEffect, useRef, useState } from 'react';
import { api, auth, setUnauthorizedHandler } from './api.js';
import StoreSetup from './pages/StoreSetup.jsx';
import ReviewInput from './pages/ReviewInput.jsx';
import ReviewList from './pages/ReviewList.jsx';
import WeeklyReport from './pages/WeeklyReport.jsx';
import Support, { ReportErrorLink } from './pages/Support.jsx';
import Admin from './pages/Admin.jsx';
import { ForgotPage, LegalPage, LoginPage, ResetPage, SignupPage, VerifyPage } from './pages/Auth.jsx';
import HelpChat from './components/HelpChat.jsx';
import { Toast, useToast } from './components/Toast.jsx';
import Icon from './components/Icon.jsx';
import { EmptyState, PrimaryButton, SecondaryButton } from './components/ui.jsx';

const VIEWS = [
  ['setup', '매장 설정'],
  ['input', '리뷰 입력'],
  ['reviews', '오늘의 리뷰'],
  ['report', '주간 리포트'],
];
const VIEW_ICON = { setup: 'store', input: 'input', reviews: 'reviews', report: 'report' };

// 로그인하지 않아도 볼 수 있는 화면
const PUBLIC_VIEWS = ['login', 'signup', 'verify', 'forgot', 'reset', 'terms', 'privacy'];
// 메뉴에 없지만 로그인하면 쓸 수 있는 화면
const EXTRA_VIEWS = ['support', 'admin'];

/** '#reviews/wait' → 화면 'reviews', 하위 탭 'wait'. '#reset?token=..' → params */
function parseHash() {
  const [path, query = ''] = window.location.hash.slice(1).split('?');
  const [v, sub = null] = path.split('/');
  const params = new URLSearchParams(query);
  const known = VIEWS.some(([key]) => key === v) || PUBLIC_VIEWS.includes(v) || EXTRA_VIEWS.includes(v);
  return known ? { view: v, sub, params } : { view: null, sub: null, params };
}
const currentView = () => parseHash().view;

export default function App() {
  const [me, setMe] = useState(undefined); // undefined: 확인 중, null: 로그인 안 함
  const [authError, setAuthError] = useState(null);
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [route, setRoute] = useState(parseHash());
  const [loginNotice, setLoginNotice] = useState(null);
  const lastPage = useRef(null); // 고객 지원으로 오기 직전 화면 (오류 위치 자동 기록)
  const toast = useToast();
  const { view, sub, params } = route;

  const checkLogin = useCallback(async () => {
    setAuthError(null);
    try {
      setMe(await auth.me());
    } catch (e) {
      setAuthError(e.message);
      setMe(null);
    }
  }, []);

  useEffect(() => {
    checkLogin();
    // 어떤 요청이든 401 이 오면(세션 만료) 로그인 화면으로
    setUnauthorizedHandler(() => {
      setMe(null);
      setLoginNotice('로그인이 만료되었습니다. 다시 로그인하십시오.');
    });
    return () => setUnauthorizedHandler(null);
  }, [checkLogin]);

  const loadStore = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const stores = await api.listStores();
      const first = stores[0] ?? null;
      setStore(first);
      // 주소에 화면이 없으면(또는 로그인 화면이면) 처음 화면을 고정한다 (설정 저장 직후 화면이 저절로 바뀌지 않게)
      const v = currentView();
      if (!v || PUBLIC_VIEWS.includes(v)) {
        const initial = !first || !first.toneProfile ? 'setup' : 'reviews';
        window.history.replaceState(null, '', `#${initial}`);
        setRoute(parseHash());
      }
    } catch (e) {
      if (e.status !== 401) setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (me) loadStore();
    else setStore(null);
  }, [me, loadStore]);

  // 고객 지원으로 갈 때 직전 화면을 기억한다 (문의에 '발생 화면'으로 자동 기록)
  const routeRef = useRef(route);
  useEffect(() => {
    routeRef.current = route;
  }, [route]);
  useEffect(() => {
    const onHash = () => {
      const prev = routeRef.current;
      const next = parseHash();
      if (next.view === 'support' && prev.view && prev.view !== 'support' && !PUBLIC_VIEWS.includes(prev.view)) {
        lastPage.current = [prev.view, prev.sub].filter(Boolean).join('/');
      }
      setRoute(next);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (v) => {
    window.location.hash = v;
  };

  async function logout() {
    try {
      await auth.logout();
    } catch {
      // 이미 만료된 세션이어도 화면은 로그아웃 상태로
    }
    setLoginNotice(null);
    setMe(null);
    window.location.hash = 'login';
  }

  function onLoggedIn(user) {
    setLoginNotice(null);
    setMe(user);
  }

  function onAccountDeleted() {
    setMe(null);
    setLoginNotice('계정과 모든 데이터를 삭제했습니다. 이용해 주셔서 감사합니다.');
    window.location.hash = 'login';
  }

  // ── 로그인 확인 중 / 로그인 전 화면 ────────────────────
  if (me === undefined) {
    return <main className="page"><EmptyState loading description="불러오는 중…" /></main>;
  }
  if (view === 'terms' || view === 'privacy') return <LegalPage kind={view} />;
  if (view === 'verify') return <VerifyPage token={params.get('token')} />;
  if (view === 'reset') return <ResetPage token={params.get('token')} />;
  if (!me) {
    if (view === 'signup') return <SignupPage />;
    if (view === 'forgot') return <ForgotPage />;
    return <LoginPage onLoggedIn={onLoggedIn} notice={authError ?? loginNotice} />;
  }

  // ── 로그인 후 ──────────────────────────────────────
  const needsSetup = !store || !store.toneProfile;
  const active = view && !PUBLIC_VIEWS.includes(view) ? view : needsSetup ? 'setup' : 'reviews';

  let page;
  if (loading) {
    page = <EmptyState loading description="불러오는 중…" />;
  } else if (loadError) {
    page = (
      <EmptyState
        title="서버에 연결할 수 없습니다"
        description={loadError}
        pose="help"
        action={(
          <div className="end">
            <SecondaryButton tone="neutral" icon="retry" onClick={loadStore}>다시 불러오기</SecondaryButton>
            <ReportErrorLink location="기타" code="LOAD_FAILED" />
          </div>
        )}
      />
    );
  } else if (active === 'support') {
    page = <Support sub={sub} params={params} from={lastPage.current} toast={toast} />;
  } else if (active === 'admin') {
    page = me.role === 'ADMIN'
      ? <Admin toast={toast} />
      : <EmptyState title="관리자만 볼 수 있습니다" description="관리자 계정으로 로그인하십시오." />;
  } else if (active === 'setup') {
    page = <StoreSetup store={store} onSaved={setStore} toast={toast} go={go} me={me} onAccountDeleted={onAccountDeleted} />;
  } else if (needsSetup) {
    page = (
      <EmptyState
        title="답글 스타일 설정 필요"
        description="기존 답글 3~5개를 등록하면 매장의 응대 스타일로 답글 초안을 작성합니다."
        action={<PrimaryButton icon="store" onClick={() => go('setup')}>매장 설정으로 이동</PrimaryButton>}
      />
    );
  } else if (active === 'input') {
    page = <ReviewInput store={store} toast={toast} go={go} />;
  } else if (active === 'report') {
    page = <WeeklyReport store={store} go={go} />;
  } else {
    page = <ReviewList key={sub ?? 'done'} store={store} toast={toast} go={go} initialTab={sub} />;
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-name">ReplyBoss</span>
            <span className="brand-divider" aria-hidden="true" />
            <span className="brand-store">{store?.name ?? '매장 미등록'}</span>
          </div>
          <nav className="nav" aria-label="화면">
            {VIEWS.map(([key, label]) => (
              <a key={key} href={`#${key}`} aria-current={active === key ? 'page' : undefined}>
                <Icon name={VIEW_ICON[key]} />
                {label}
              </a>
            ))}
          </nav>
          <UserMenu me={me} active={active} onLogout={logout} />
        </div>
      </header>
      <main className={`page page-${active}`}>{page}</main>
      <HelpChat />
      <Toast state={toast} />
    </div>
  );
}

/** 헤더 오른쪽: 고객 지원 · 관리자(관리자만) · 계정 메뉴(이메일, 로그아웃) */
function UserMenu({ me, active, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="usermenu" ref={ref}>
      <a className="usermenu-link" href="#support" aria-current={active === 'support' ? 'page' : undefined}>
        <Icon name="support" />
        <span>고객 지원</span>
      </a>
      {me.role === 'ADMIN' && (
        <a className="usermenu-link" href="#admin" aria-current={active === 'admin' ? 'page' : undefined}>
          <Icon name="admin" />
          <span>관리자</span>
        </a>
      )}
      <button type="button" className="icon-btn usermenu-btn" aria-label="계정 메뉴" aria-expanded={open} aria-haspopup="menu"
              title={me.email} onClick={() => setOpen((v) => !v)}>
        <Icon name="user" />
      </button>
      {open && (
        <div className="usermenu-pop" role="menu">
          <p className="usermenu-email">{me.email}</p>
          <a role="menuitem" href="#setup" onClick={() => setOpen(false)}><Icon name="store" size={16} />매장·계정 설정</a>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onLogout(); }}>
            <Icon name="logout" size={16} />로그아웃
          </button>
        </div>
      )}
    </div>
  );
}
