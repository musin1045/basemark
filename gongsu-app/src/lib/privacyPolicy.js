import { PRIVACY_POLICY_URL } from './releaseInfo';

export const PRIVACY_POLICY_EFFECTIVE_DATE = '2026-03-22';

export const PRIVACY_POLICY_SUMMARY = [
  '이 앱은 현장, 공수, 단가, 정산 메모 같은 입력 데이터를 기본적으로 기기 안에만 저장합니다.',
  '파일 가져오기, 내보내기, 공유를 직접 실행한 경우에만 사용자가 고른 위치나 앱으로 데이터가 전달됩니다.',
  '저녁 알림을 켜면 알림 시간 설정과 로컬 알림 예약 정보만 기기 안에 저장하며, 서버로 푸시 토큰을 수집하지 않습니다.',
  '앱 개발과 문의 창구는 GitHub 저장소 이슈 페이지를 기준으로 안내합니다.',
];

export const PRIVACY_POLICY_CONTACT_URL =
  'https://github.com/musin1045/basemark/issues';

export function getPrivacyPolicyLink() {
  return PRIVACY_POLICY_URL || PRIVACY_POLICY_CONTACT_URL;
}
