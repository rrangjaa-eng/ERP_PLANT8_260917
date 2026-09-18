export type Viewer = { id: string; isAdmin: boolean };

// CLI·훅·Job·healthz 프로브 전용 — 사람이 아닌 시스템 주체가 리포지토리를 호출할 때 쓴다.
export const SYSTEM_VIEWER: Viewer = { id: "system", isAdmin: true };
