// 공통 UI 컴포넌트: 모든 페이지가 같은 버튼·입력창·카드·상태 표시를 쓰도록 한 곳에 모은다.
// 스타일은 styles.css 의 같은 이름 클래스(.btn, .input, .section, .indicator ...)만 사용한다.
import { forwardRef, useId } from 'react';
import Icon from './Icon.jsx';
import Spinner from './Spinner.jsx';

const cls = (...names) => names.filter(Boolean).join(' ');

/* ── 페이지 머리말 ─────────────────────────────────── */
export function PageHeader({ title, description, actions }) {
  return (
    <div className="page-head">
      <div className="page-title">
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

/* ── 버튼 ─────────────────────────────────────────── */
function ButtonBase({ variant, icon, loading = false, loadingText, size, className, disabled, children, ...rest }) {
  return (
    <button
      type="button"
      className={cls('btn', variant, size === 'sm' && 'btn-sm', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}

/** 화면의 주요 액션 (파란 버튼). loading 중에는 자동으로 비활성화돼 중복 클릭을 막는다. */
export function PrimaryButton(props) {
  return <ButtonBase variant="btn-primary" {...props} />;
}

/** 보조 액션. tone="outline"(파란 테두리, 기본) | "neutral"(회색 테두리) */
export function SecondaryButton({ tone = 'outline', ...props }) {
  return <ButtonBase variant={tone === 'outline' ? 'btn-outline' : 'btn-neutral'} {...props} />;
}

/** 아이콘만 있는 버튼. label 은 스크린리더와 툴팁에 쓰인다. tone="danger" 는 삭제용 */
export function IconButton({ icon, label, tone, size, className, iconSize, ...rest }) {
  return (
    <button
      type="button"
      className={cls('icon-btn', tone && `icon-btn-${tone}`, size === 'sm' && 'icon-btn-sm', className)}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} size={iconSize ?? (size === 'sm' ? 16 : 18)} />
    </button>
  );
}

/* ── 입력 ─────────────────────────────────────────── */
function Field({ id, label, hideLabel, error, hint, className, children }) {
  return (
    <div className={cls('field', className)}>
      {label && (
        <label className={hideLabel ? 'sr-only' : 'label'} htmlFor={id}>
          {label}
        </label>
      )}
      {children}
      {error && (
        <p className="field-error" id={`${id}-error`} role="alert">
          <Icon name="error" size={16} />
          {error}
        </p>
      )}
      {hint && !error && (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * 한 줄 입력(기본) 또는 여러 줄 입력(multiline).
 * counter: 글자 수 표시 문자열, counterInside 면 입력창 오른쪽 안쪽에 표시
 * icon: 입력창 왼쪽 안쪽 아이콘
 */
export const FormInput = forwardRef(function FormInput(
  { id: idProp, label, hideLabel, error, hint, counter, counterInside, icon, multiline, type = 'text', className, fieldClassName, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const describedBy = cls(error && `${id}-error`, hint && !error && `${id}-hint`) || undefined;
  const Tag = multiline ? 'textarea' : 'input';
  const filled = rest.value != null && String(rest.value).length > 0;
  const control = (
    <Tag
      ref={ref}
      id={id}
      type={multiline ? undefined : type}
      className={cls(
        multiline ? 'textarea' : 'input',
        icon && 'has-icon',
        counterInside && 'has-counter',
        filled && 'is-filled',
        error && 'is-invalid',
        className,
      )}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      {...rest}
    />
  );
  return (
    <Field id={id} label={label} hideLabel={hideLabel} error={error} hint={hint} className={fieldClassName}>
      {/* 감싸는 구조는 값과 상관없이 고정해야 한다. 글자 수가 생길 때 구조가 바뀌면 입력창이 다시 만들어져
          포커스와 한글 조합이 끊긴다 (첫 글자 입력 후 입력이 멈추는 문제) */}
      {icon || counterInside ? (
        <div className="control-wrap">
          {icon && <Icon name={icon} className="control-icon" />}
          {control}
          {counter != null && counterInside && <span className="counter counter-inside" aria-hidden="true">{counter}</span>}
        </div>
      ) : (
        control
      )}
      {counter != null && !counterInside && <span className="counter">{counter}</span>}
    </Field>
  );
});

/** 선택창. options: ['값', ...] 또는 [['값', '표시'], ...] */
export function FormSelect({ id: idProp, label, hideLabel, options, icon, error, hint, className, fieldClassName, ...rest }) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const select = (
    <select
      id={id}
      className={cls('select', icon && 'has-icon', error && 'is-invalid', className)}
      aria-invalid={error ? true : undefined}
      {...rest}
    >
      {options.map((o) => {
        const [value, text] = Array.isArray(o) ? o : [o, o];
        return (
          <option key={value} value={value}>
            {text}
          </option>
        );
      })}
    </select>
  );
  return (
    <Field id={id} label={label} hideLabel={hideLabel} error={error} hint={hint} className={fieldClassName}>
      {icon ? (
        <div className="control-wrap">
          <Icon name={icon} className={cls('control-icon', `control-icon-${icon}`)} />
          {select}
        </div>
      ) : (
        select
      )}
    </Field>
  );
}

/* ── 카드 ─────────────────────────────────────────── */
/**
 * 제목·설명 머리, 본문, 하단 액션 영역으로 이뤄진 카드.
 * footer: 오른쪽 정렬 액션, footerStart: 왼쪽 요소. as="form" 으로 폼 카드도 된다.
 */
export function SectionCard({ as: Tag = 'section', title, description, aside, header, footer, footerStart, stickyFooter, className, children, ...rest }) {
  const headingId = useId();
  return (
    <Tag className={cls('section', className)} aria-labelledby={title ? headingId : undefined} {...rest}>
      {title && (
        <div className="section-head">
          <div className="section-heading">
            <h2 id={headingId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          {aside}
        </div>
      )}
      {header && <div className="section-toolbar">{header}</div>}
      <div className="section-body">{children}</div>
      {(footer || footerStart) && (
        <div className={cls('section-foot', stickyFooter && 'is-sticky')}>
          {footerStart ?? <span />}
          {footer && <div className="end">{footer}</div>}
        </div>
      )}
    </Tag>
  );
}

/**
 * 설정 화면의 한 구역: 왼쪽에 제목·설명·상태, 오른쪽에 입력 항목과 그 구역의 저장 버튼.
 * status: 지금 데이터 기준의 진행 상태 (예: 저장됨, 3/5개) — 화면에 이미 있는 값만 넣는다.
 */
export function SettingsSection({ as: Tag = 'section', title, description, status, actions, actionsStart, children, ...rest }) {
  const headingId = useId();
  return (
    <Tag className="settings-section" aria-labelledby={headingId} {...rest}>
      <div className="settings-aside">
        <h2 id={headingId}>{title}</h2>
        {description && <p>{description}</p>}
        {status && <div className="settings-status">{status}</div>}
      </div>
      <div className="settings-main">
        {children}
        {(actions || actionsStart) && (
          <div className="settings-actions">
            {actionsStart ?? <span />}
            {actions && <div className="end">{actions}</div>}
          </div>
        )}
      </div>
    </Tag>
  );
}

/** 표 위의 도구 줄: 왼쪽(필터 등)과 오른쪽(보조 정보·액션) */
export function Toolbar({ start, end, className, ...rest }) {
  return (
    <div className={cls('toolbar', className)} {...rest}>
      <div className="toolbar-start">{start}</div>
      {end && <div className="toolbar-end">{end}</div>}
    </div>
  );
}

/* ── 데이터 표 ─────────────────────────────────────── */
/**
 * 세 화면의 표(리뷰 입력·미리보기·리뷰 목록)가 같은 머리줄·행 간격·구분선을 쓰도록 하는 틀.
 * 열 너비는 표마다 CSS 변수 --dt-cols 로 정한다. scroll 이면 높이를 제한하고 머리줄을 고정한다.
 */
export function DataTable({ label, className, scroll, children, ...rest }) {
  return (
    <div className={cls('dt', scroll && 'dt-scroll', className)} role="table" aria-label={label} {...rest}>
      {children}
    </div>
  );
}

/** columns: [{ label, className }] */
export function DataTableHead({ columns }) {
  return (
    <div className="dt-row dt-head" role="row">
      {columns.map((c) => (
        <span key={c.label} role="columnheader" className={c.className}>{c.label}</span>
      ))}
    </div>
  );
}

export function DataTableRow({ className, children, ...rest }) {
  return (
    <div role="row" className={cls('dt-row', className)} {...rest}>
      {children}
    </div>
  );
}

/** 비어 있음·불러오는 중·오류 같은 안내 카드 */
export function EmptyState({ title, description, loading, action }) {
  return (
    <div className="section empty" role={loading ? 'status' : undefined}>
      {loading && <Spinner />}
      {title && <h2>{title}</h2>}
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

/** 페이지 상단 오류 안내 (입력 위치와 무관한 서버 오류 등) */
export function Alert({ children, action }) {
  return (
    <div className="alert" role="alert">
      <Icon name="error" />
      <span>{children}</span>
      {action}
    </div>
  );
}

/* ── 상태 표시 ─────────────────────────────────────── */
/**
 * 색 점(또는 아이콘) + 글자. 색만으로 상태를 전달하지 않도록 항상 글자를 함께 쓴다.
 * tone: success | neutral | danger | praise | complaint | malicious | inquiry | rating
 */
export function StatusIndicator({ tone = 'neutral', icon, children }) {
  return (
    <span className={cls('indicator', `indicator-${tone}`)}>
      {icon ? <Icon name={icon} size={16} /> : <span className="indicator-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

/* ── 탭 (세그먼트 컨트롤) ───────────────────────────── */
/** tabs: [{ key, label, icon }]. 패널은 TabPanel 로 감싼다. ←/→ 키로 이동한다. */
export function SegmentedTabs({ tabs, value, onChange, label, idPrefix }) {
  function onKeyDown(e) {
    const i = tabs.findIndex((t) => t.key === value);
    const next = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : null;
    if (next == null) return;
    e.preventDefault();
    onChange(tabs[next].key);
    document.getElementById(`${idPrefix}-tab-${tabs[next].key}`)?.focus();
  }
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${t.key}`}
          aria-controls={`${idPrefix}-panel-${t.key}`}
          aria-selected={value === t.key}
          tabIndex={value === t.key ? 0 : -1}
          onClick={() => onChange(t.key)}
          onKeyDown={onKeyDown}
        >
          {t.icon && <Icon name={t.icon} />}
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** 탭 패널: 숨겨도 상태가 유지되도록 마운트는 유지하고 hidden 으로만 감춘다 */
export function TabPanel({ idPrefix, tabKey, active, children }) {
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${tabKey}`} aria-labelledby={`${idPrefix}-tab-${tabKey}`} hidden={!active}
         className="tab-panel">
      {children}
    </div>
  );
}
