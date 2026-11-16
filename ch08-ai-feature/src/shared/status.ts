// 작업 결과 상태의 화면·CSV용 이름표. 이력 화면과 CSV 내보내기가 함께 쓴다
import type { JobStatus } from './ipc';

export const STATUS_LABEL: Record<JobStatus, string> = {
  done: '완료',
  canceled: '취소',
  failed: '실패',
};
