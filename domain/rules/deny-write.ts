import type { Viewer } from "@/domain/viewer";
import { log } from "@/lib/log";

// 04-20(D19 · 엔지 리뷰 B 「one helper」): 거부 운영 로그 `write.denied`의 유일한
// 입구 — 04-11·04-22·04-12·그룹 B가 같은 함수를 부른다. 허용 목록 id만 싣고
// 금액 키와 이유 문자열(err.message)은 싣지 않는다. 행동 로그(action_log)에는
// 남기지 않는다(거부는 행동이 아니다 — T-04-38).
export type DenyWriteIds = {
  projectId?: string;
  revisionId?: string;
  lineIds?: string[];
  entryIds?: string[];
  clientIds?: string[];
  sourceProjectId?: string;
  from?: string;
  to?: string;
};

const ALLOWED_ID_KEYS = [
  "projectId",
  "revisionId",
  "lineIds",
  "entryIds",
  "clientIds",
  "sourceProjectId",
  "from",
  "to",
] as const satisfies readonly (keyof DenyWriteIds)[];

export function denyWrite(viewer: Viewer, rule: string, ids: DenyWriteIds, err: Error): never {
  // 키를 하나씩 골라 복사한다 — 캐스팅으로 넘어온 다른 키(금액 등)는 실리지 않는다.
  const picked: Record<string, unknown> = {};
  for (const key of ALLOWED_ID_KEYS) {
    if (ids[key] !== undefined) picked[key] = ids[key];
  }
  // 오류 종류는 클래스 이름이다 — UserFacingError 계열은 name을 따로 두지 않아
  // err.name이 늘 "Error"다(lib/gcp/cloud-sql-admin.ts 선례).
  log.warn("write.denied", { viewerId: viewer.id, rule, errorName: err.constructor.name, ...picked });
  throw err;
}
