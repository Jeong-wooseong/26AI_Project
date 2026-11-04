// ReplyBoss 캐릭터. 장식용이라 스크린리더에는 읽히지 않는다 (옆의 글이 같은 내용을 전한다).
import hero from '../assets/mascot/hero.png';
import smile from '../assets/mascot/smile.png';
import happy from '../assets/mascot/happy.png';
import thinking from '../assets/mascot/thinking.png';
import analyzing from '../assets/mascot/analyzing.png';
import writing from '../assets/mascot/writing.png';
import done from '../assets/mascot/done.png';
import help from '../assets/mascot/help.png';
import hello from '../assets/mascot/hello.png';

const POSES = { hero, smile, happy, thinking, analyzing, writing, done, help, hello };

/** pose: hero(대표) | smile | happy | thinking | analyzing(분석 중) | writing(답글 작성 중) | done(완료) | help(오류·확인 필요) | hello(인사) */
export default function Mascot({ pose = 'smile', size = 96, className = '' }) {
  return (
    <img src={POSES[pose] ?? smile} alt="" aria-hidden="true" style={{ height: size, width: 'auto' }}
         className={`mascot mascot-${pose} ${className}`} draggable="false" />
  );
}
