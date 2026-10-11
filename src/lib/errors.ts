/**
 * 비즈니스 로직에서 "사용자에게 그대로 보여줘도 되는" 에러의 공통 베이스.
 * OrderError/CouponError/RefundError 등은 전부 이걸 상속한다 - 봇의 전역 에러
 * 핸들러(src/bot/index.ts)가 이 타입인지로 "사람이 쓴 친절한 한국어 메시지"와
 * "디스코드 API/예상 못한 시스템 에러의 날것 메시지"를 구분해서, 후자는 사용자에게
 * 기술적인 원문을 그대로 노출하지 않고 일반적인 안내 문구로 바꿔 보여준다.
 */
export class UserFacingError extends Error {}
