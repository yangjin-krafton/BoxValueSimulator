/**
 * 인게임 3D 입력 차단 플래그.
 * 전체화면 UI(도감 등)가 열릴 때 true로 설정하면
 * 모든 3D 레이캐스트 핸들러가 조기 반환된다.
 */
export const InputGuard = {
  blocked: false,

  block()   { this.blocked = true;  },
  unblock() { this.blocked = false; },
};
