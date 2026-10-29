// Lucide 아이콘을 같은 규칙으로 쓰기 위한 래퍼: Outline, 선 굵기 1.75, 기본 18px.
// 같은 기능에는 항상 같은 아이콘을 쓰도록 이 파일에서만 가져온다.
import {
  Calendar,
  ChartColumn,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardPaste,
  Download,
  FileSpreadsheet,
  Info,
  Keyboard,
  Undo2,
  Upload,
  ClipboardList,
  Copy,
  ListChecks,
  LoaderCircle,
  Lock,
  MessageSquareText,
  Pencil,
  Plus,
  RotateCw,
  Save,
  Search,
  ShieldAlert,
  ScanText,
  Star,
  Store,
  Trash2,
  X,
} from 'lucide-react';

const ICONS = {
  store: Store, // 가게 설정
  input: MessageSquareText, // 리뷰 입력
  reviews: ClipboardList, // 오늘의 리뷰
  report: ChartColumn, // 주간 리포트
  add: Plus,
  delete: Trash2,
  remove: X,
  lock: Lock,
  save: Save,
  analyze: ScanText,
  classify: ListChecks,
  calendar: Calendar,
  copy: Copy,
  edit: Pencil,
  confirm: Check,
  retry: RotateCw,
  star: Star,
  prev: ChevronLeft,
  next: ChevronRight,
  loading: LoaderCircle,
  error: CircleAlert,
  info: Info,
  manual: Keyboard, // 직접 입력
  paste: ClipboardPaste, // 여러 리뷰 붙여넣기
  file: FileSpreadsheet, // 파일 가져오기
  upload: Upload,
  download: Download,
  restore: Undo2,
  search: Search,
  guide: ShieldAlert, // 악성 리뷰 대응 가이드
};

export default function Icon({ name, size = 18, className = '', ...rest }) {
  const Cmp = ICONS[name];
  return <Cmp size={size} strokeWidth={1.75} aria-hidden="true" className={`icon ${className}`} {...rest} />;
}
