// 작성 대기 리뷰를 한 번에 처리: 고른 말투(정중·친근·간결)의 초안으로 작성 완료하거나 초안만 만든다.
// 불만·악성 리뷰는 체크한 경우에만 포함한다. 악성 리뷰는 대응 초안만 만들고, 작성 완료는 사장님이 확인한 뒤 직접 한다.
// 배달앱·지도에는 아무것도 게시하지 않는다.
import { useRef, useState } from 'react';
import { api } from '../../api.js';
import Icon from '../Icon.jsx';
import { PrimaryButton, SecondaryButton } from '../ui.jsx';
import { DRAFT_TONES, DRAFT_TYPES, hasFillIn, textOf } from './replyModel.js';

const TONES = [['POLITE', '정중형'], ['FRIENDLY', '친근형'], ['CONCISE', '간결형']];
const BASIC_TYPES = ['PRAISE', 'INQUIRY', 'RATING_ONLY'];

/** 처리 대상: 분류된 작성 대기 리뷰 중 고른 유형 */
export function bulkTargets(reviews, { complaint, malicious }) {
  return reviews.filter((r) => r.status === 'CLASSIFIED' && r.finalReplyId == null
    && (BASIC_TYPES.includes(r.type) || (complaint && r.type === 'COMPLAINT') || (malicious && r.type === 'MALICIOUS')));
}

export default function BulkReplyPanel({ reviews, onUpdated, onClose, toast }) {
  const [tone, setTone] = useState('POLITE');
  const [complaint, setComplaint] = useState(false);
  const [malicious, setMalicious] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total, mode }
  const [result, setResult] = useState(null);
  const stop = useRef(false);

  const count = (type) => reviews.filter((r) => r.status === 'CLASSIFIED' && r.type === type).length;
  const basic = BASIC_TYPES.reduce((n, t) => n + count(t), 0);
  const targets = bulkTargets(reviews, { complaint, malicious });
  const toneLabel = TONES.find(([k]) => k === tone)[1];
  const running = progress != null;

  async function run(mode) {
    if (running || targets.length === 0) return;
    stop.current = false;
    const res = { completed: 0, drafted: 0, guide: 0, held: [], error: null, stopped: false };
    setResult(null);
    setProgress({ done: 0, total: targets.length, mode });
    for (let i = 0; i < targets.length; i += 1) {
      if (stop.current) {
        res.stopped = true;
        break;
      }
      let r = targets[i];
      try {
        if (r.type === 'MALICIOUS') {
          // 대응 초안만 (전략 추천). 작성 완료는 사장님 확인이 필요하므로 하지 않는다
          if (!r.replies.some((p) => p.tone === 'GUIDE')) {
            r = await api.maliciousGuide(r.id);
            onUpdated(r);
          }
          res.guide += 1;
        } else {
          if (DRAFT_TYPES.includes(r.type) && !r.replies.some((p) => DRAFT_TONES.includes(p.tone))) {
            r = await api.generateReplies(r.id);
            onUpdated(r);
            if (mode === 'drafts') res.drafted += 1;
          }
          if (mode !== 'drafts') {
            const pick = r.type === 'RATING_ONLY'
              ? r.replies.find((p) => p.tone === 'TEMPLATE')
              : r.replies.find((p) => p.tone === tone);
            const text = pick && textOf(pick);
            if (!pick) {
              res.held.push({ id: r.id, reason: `${toneLabel} 초안이 없음` });
            } else if (hasFillIn(text)) {
              res.held.push({ id: r.id, reason: '채워야 할 [ ] 항목이 있음' });
            } else if (r.riskSignals?.length > 0) {
              res.held.push({ id: r.id, reason: `사장님 확인 필요 (${r.riskSignals.join(', ')})` });
            } else {
              onUpdated(await api.completeReply(r.id, pick.id, text, false));
              res.completed += 1;
            }
          }
        }
      } catch (e) {
        res.error = `${e.message} (오류 코드 ${e.code})`;
        break; // 속도 제한·크레딧 문제일 수 있으므로 멈춘다
      }
      setProgress({ done: i + 1, total: targets.length, mode });
    }
    setProgress(null);
    setResult(res);
    if (res.completed) toast.show(`${res.completed}건을 ${toneLabel}으로 작성 완료했습니다.`);
    else if (res.drafted || res.guide) toast.show(`초안 ${res.drafted + res.guide}건을 만들었습니다.`);
  }

  return (
    <section className="bulk-panel" aria-label="답글 일괄 처리">
      <div className="bulk-panel-head">
        <div>
          <h2>답글 일괄 처리</h2>
          <p className="hint">지금 보이는 작성 대기 리뷰를 한 번에 처리합니다. 배달앱·지도에는 게시되지 않습니다.</p>
        </div>
        <button type="button" className="icon-btn" aria-label="일괄 처리 닫기" onClick={onClose} disabled={running}>
          <Icon name="remove" />
        </button>
      </div>

      <div className="bulk-panel-body">
        <fieldset className="bulk-field">
          <legend className="label">말투</legend>
          <div className="bulk-tones" role="radiogroup">
            {TONES.map(([key, label]) => (
              <label key={key} className={`chip ${tone === key ? 'is-on' : ''}`}>
                <input type="radio" className="sr-only" name="bulk-tone" checked={tone === key}
                       onChange={() => setTone(key)} disabled={running} />
                {label}
              </label>
            ))}
          </div>
          <p className="hint">별점만 있는 리뷰는 말투와 관계없이 템플릿 답글로 처리합니다.</p>
        </fieldset>

        <fieldset className="bulk-field">
          <legend className="label">포함할 리뷰</legend>
          <label className="check is-fixed">
            <input type="checkbox" checked disabled />
            칭찬·문의·별점만 <span className="bulk-n">{basic}건</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={complaint} onChange={(e) => setComplaint(e.target.checked)} disabled={running} />
            불만 리뷰 포함 <span className="bulk-n">{count('COMPLAINT')}건</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={malicious} onChange={(e) => setMalicious(e.target.checked)} disabled={running} />
            악성 리뷰 포함 <span className="bulk-n">{count('MALICIOUS')}건</span>
          </label>
          {malicious && <p className="hint bulk-warn">악성 리뷰는 대응 초안만 만듭니다. 작성 완료는 내용을 확인한 뒤 직접 하십시오.</p>}
        </fieldset>
      </div>

      <p className="notice notice-info">
        <Icon name="info" size={16} />
        <span>채워야 할 [ ] 항목이 있거나 '사장님 확인 필요'로 표시된 리뷰는 초안만 만들어 두고 작성 완료하지 않습니다.</span>
      </p>

      {running && (
        <div className="bulk-progress" role="status" aria-live="polite">
          <span className="count-bar"><span style={{ width: `${(progress.done / progress.total) * 100}%` }} /></span>
          <span>{progress.mode === 'drafts' ? '초안 만드는 중' : `${toneLabel}으로 처리 중`} {progress.done}/{progress.total}</span>
          <SecondaryButton tone="neutral" size="sm" onClick={() => { stop.current = true; }}>지금 건까지만 하고 멈추기</SecondaryButton>
        </div>
      )}

      {result && !running && (
        <div className={`bulk-result ${result.error ? 'has-error' : ''}`} role="status">
          <p>
            {result.completed > 0 && <>작성 완료 <strong>{result.completed}건</strong> · </>}
            {result.drafted > 0 && <>초안 생성 <strong>{result.drafted}건</strong> · </>}
            {result.guide > 0 && <>악성 대응 초안 <strong>{result.guide}건</strong> · </>}
            초안만 남김 <strong>{result.held.length}건</strong>
            {result.stopped && ' · 중간에 멈춤'}
          </p>
          {result.held.length > 0 && (
            <ul className="bulk-held">
              {Object.entries(result.held.reduce((m, h) => ({ ...m, [h.reason]: (m[h.reason] ?? 0) + 1 }), {}))
                .map(([reason, n]) => <li key={reason}>{reason}: {n}건</li>)}
            </ul>
          )}
          {result.error && <p className="field-error"><Icon name="error" size={16} />멈춤: {result.error}</p>}
        </div>
      )}

      <div className="bulk-panel-foot">
        <span className="hint">대상 <strong>{targets.length}건</strong> (한 건씩 차례로 처리, 건마다 AI 호출이 생깁니다)</span>
        <div className="end">
          <SecondaryButton icon="analyze" onClick={() => run('drafts')} disabled={running || targets.length === 0}>
            초안만 만들기
          </SecondaryButton>
          <PrimaryButton icon="confirm" onClick={() => run('complete')} disabled={running || targets.length === 0}>
            {toneLabel}으로 작성 완료
          </PrimaryButton>
        </div>
      </div>
    </section>
  );
}
