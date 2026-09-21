// 필터 축 넷(사람·기간·행동 종류·문서) + 정리 포함 3차 토글의 키 상수.
// 이 파일에 다른 import를 두지 않는다 — domain/action-log/index.ts는
// repositories(→ db/client.ts → pg)를 거쳐가는 무거운 서버 전용 의존 체인을
// 갖고 있어, 클라이언트 컴포넌트(filter-bar.tsx)가 그 파일에서 상수 하나만
// 골라 import해도 Next.js 클라이언트 번들에 `pg`가 통째로 딸려 들어간다
// (실측: `pnpm build`가 "tls"/"util/types" 모듈 해석 실패로 즉시 재현했다).
// 순수 상수만 담은 잎(leaf) 모듈로 분리해 그 문제를 원천 차단한다.
export const ACTION_LOG_FILTER_KEYS = ["actorId", "from", "to", "actionType", "documentId", "includePruned"] as const;
export type ActionLogFilterKey = (typeof ACTION_LOG_FILTER_KEYS)[number];
