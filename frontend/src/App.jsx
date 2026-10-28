import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import StoreSetup from './pages/StoreSetup.jsx';
import ReviewInput from './pages/ReviewInput.jsx';
import ReviewList from './pages/ReviewList.jsx';
import { Toast, useToast } from './components/Toast.jsx';
import Icon from './components/Icon.jsx';
import { EmptyState, PrimaryButton, SecondaryButton } from './components/ui.jsx';

const VIEWS = [
  ['setup', '매장 설정'],
  ['input', '리뷰 입력'],
  ['reviews', '오늘의 리뷰'],
];
const VIEW_ICON = { setup: 'store', input: 'input', reviews: 'reviews' };

function currentView() {
  const v = window.location.hash.slice(1);
  return VIEWS.some(([key]) => key === v) ? v : null;
}

export default function App() {
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [view, setView] = useState(currentView());
  const toast = useToast();

  const loadStore = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const stores = await api.listStores();
      const first = stores[0] ?? null;
      setStore(first);
      // 주소에 화면이 없으면 처음 화면을 고정한다 (설정 저장 직후 화면이 저절로 바뀌지 않게)
      if (!currentView()) {
        const initial = !first || !first.toneProfile ? 'setup' : 'reviews';
        window.history.replaceState(null, '', `#${initial}`);
        setView(initial);
      }
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStore();
  }, [loadStore]);

  useEffect(() => {
    const onHash = () => {
      setView(currentView());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // 가게가 없거나 말투가 없으면 설정부터
  const needsSetup = !store || !store.toneProfile;
  const active = view ?? (needsSetup ? 'setup' : 'reviews');
  const go = (v) => {
    window.location.hash = v;
  };

  let page;
  if (loading) {
    page = <EmptyState loading description="불러오는 중…" />;
  } else if (loadError) {
    page = (
      <EmptyState
        title="서버에 연결할 수 없습니다"
        description={loadError}
        action={<SecondaryButton tone="neutral" icon="retry" onClick={loadStore}>다시 불러오기</SecondaryButton>}
      />
    );
  } else if (active === 'setup') {
    page = <StoreSetup store={store} onSaved={setStore} toast={toast} go={go} />;
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
  } else {
    page = <ReviewList store={store} toast={toast} go={go} />;
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
        </div>
      </header>
      <main className={`page page-${active}`}>{page}</main>
      <Toast state={toast} />
    </div>
  );
}
