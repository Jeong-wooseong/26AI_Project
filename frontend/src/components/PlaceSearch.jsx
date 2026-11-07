import { useState } from 'react';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import { FormInput, SecondaryButton } from './ui.jsx';

/**
 * 지도에서 매장 찾기: 카카오 로컬(공식 장소 검색 API) 결과에서 매장을 고르면 이름·업종·장소를 채운다.
 * 메뉴·영업시간은 이 API 에 없어서 사장님이 직접 적는다.
 */
export default function PlaceSearch({ onPick }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null); // null: 아직 검색 안 함
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function search() {
    const q = query.trim();
    if (q.length < 2) {
      setMessage('매장 이름을 두 글자 이상 입력하십시오.');
      setResults(null);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      setResults(await api.searchPlaces(q));
    } catch (err) {
      setResults(null);
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  function pick(place) {
    onPick(place);
    setResults(null);
    setQuery('');
  }

  return (
    <div className="place-search">
      <div className="place-search-bar">
        <FormInput id="placeQuery" label="지도에서 매장 찾기" icon="search" value={query} maxLength={50}
                   placeholder="매장 이름 (예: 리플라이 커피 합정)"
                   onChange={(e) => setQuery(e.target.value)}
                   onKeyDown={(e) => {
                     if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); search(); }
                   }} />
        <SecondaryButton tone="neutral" icon="search" onClick={search} loading={busy} loadingText="찾는 중">찾기</SecondaryButton>
      </div>

      {message && <p className="place-msg" role="status"><Icon name="info" size={15} />{message}</p>}
      {results && results.length === 0 && (
        <p className="place-msg" role="status"><Icon name="info" size={15} />찾은 매장이 없습니다. 동네 이름을 함께 넣어 다시 찾아보십시오.</p>
      )}
      {results && results.length > 0 && (
        <ul className="place-results" aria-label="찾은 매장">
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => pick(p)}>
                <span className="place-name">{p.name}</span>
                <span className="place-meta">{p.categoryPath}</span>
                <span className="place-meta">{p.address}</span>
                <span className="place-pick">이 매장으로 채우기</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
