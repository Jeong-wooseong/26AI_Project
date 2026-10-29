import { useEffect, useState } from 'react';

// 서버는 진행률을 알려주지 않으므로 퍼센트 대신 '지금 하는 일'과 끝을 알 수 없는 진행 막대만 보여준다.
// 단계는 시간에 따라 넘어가고 마지막 단계에서 멈춘다. 로더는 실제 응답이 오면(부모가 내리면) 사라진다.
const STEPS = [
  { at: 0, text: '리뷰 내용 분석 중' },
  { at: 1400, text: '매장 말투 반영 중' },
  { at: 3200, text: '답글 초안 생성 중' },
  { at: 7000, text: '답글 검토 중' },
];

export default function ReplyGenerationLoader() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timers = STEPS.slice(1).map((s, i) => setTimeout(() => setStep(i + 1), s.at));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="gen-loader" role="status" aria-live="polite">
      <div className="gen-track" aria-hidden="true"><span className="gen-bar" /></div>
      <p className="gen-step" key={step}>{STEPS[step].text}</p>
      <p className="gen-note">정중형, 친근형, 간결형 초안을 만들고 있습니다. 응답이 오는 대로 표시합니다.</p>
    </div>
  );
}
