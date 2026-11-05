// 매장 설정 맨 아래: 로그인한 계정 정보와 계정 탈퇴 (비밀번호 확인 후 모든 데이터 즉시 삭제)
import { useState } from 'react';
import { auth } from '../api.js';
import { Alert, FormInput, SecondaryButton, SettingsSection } from './ui.jsx';

export default function AccountSection({ me, onDeleted }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      await auth.deleteAccount(password);
      onDeleted();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <SettingsSection
      title="계정"
      description="로그인한 계정과 탈퇴 설정입니다. 탈퇴하면 계정과 모든 데이터가 즉시 삭제되며 되돌릴 수 없습니다."
    >
      <div className="field">
        <span className="label">로그인 이메일</span>
        <p className="account-email">{me?.email}{me?.role === 'ADMIN' && <span className="tag">관리자</span>}</p>
      </div>
      {!open ? (
        <SecondaryButton tone="neutral" icon="delete" className="btn-danger-text" onClick={() => setOpen(true)}>
          계정 탈퇴
        </SecondaryButton>
      ) : (
        <div className="danger-zone">
          <p className="danger-title">계정 탈퇴</p>
          <ul className="hint danger-list">
            <li>매장 정보, 답글 스타일, 리뷰, 답글 초안과 최종 답글, 주간 리포트가 삭제됩니다.</li>
            <li>남긴 문의와 첨부 이미지도 함께 삭제됩니다.</li>
            <li>배달앱·지도에 이미 게시한 답글은 ReplyBoss가 지우지 않습니다.</li>
          </ul>
          <FormInput label="비밀번호 확인" type="password" autoComplete="current-password" value={password}
                     onChange={(e) => setPassword(e.target.value)} />
          <label className="check">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            모든 데이터가 삭제되며 되돌릴 수 없음을 확인했습니다.
          </label>
          {error && <Alert>{error}</Alert>}
          <div className="end">
            <SecondaryButton tone="neutral" onClick={() => { setOpen(false); setPassword(''); setAgree(false); setError(null); }}
                             disabled={busy}>
              취소
            </SecondaryButton>
            <button type="button" className="btn btn-danger" disabled={!password || !agree || busy} onClick={remove}>
              {busy ? '삭제 중…' : '탈퇴하고 모두 삭제'}
            </button>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
