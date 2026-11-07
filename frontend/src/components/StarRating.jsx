// 별점 고르기: 별 5개를 눌러 고른다 (←/→ 키로도 바꿀 수 있음). 색과 함께 'n점' 글자를 스크린리더에 알린다.
import { useState } from 'react';
import Icon from './Icon.jsx';

export default function StarRating({ value, onChange, label = '별점', size = 22 }) {
  const [hover, setHover] = useState(null);
  const shown = hover ?? value;

  function onKeyDown(e) {
    const cur = value ?? 0;
    const next = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? Math.min(5, cur + 1)
      : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? Math.max(1, cur - 1) : null;
    if (next == null) return;
    e.preventDefault();
    onChange(next);
    e.currentTarget.parentElement.querySelectorAll('[role="radio"]')[next - 1]?.focus();
  }

  return (
    <div className="stars" role="radiogroup" aria-label={label} onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n}점`}
                tabIndex={value === n || (value == null && n === 1) ? 0 : -1}
                className={`star ${shown != null && n <= shown ? 'is-on' : ''} ${hover != null && n <= hover ? 'is-preview' : ''}`}
                onClick={() => onChange(n)} onMouseEnter={() => setHover(n)} onKeyDown={onKeyDown}>
          <Icon name="star" size={size} />
        </button>
      ))}
      <span className={`stars-value ${shown == null ? 'is-empty' : ''}`} aria-hidden="true">{shown ?? '선택'}</span>
    </div>
  );
}
