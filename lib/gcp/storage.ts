// 05-04(EVID-01): 증빙 파일 저장소 포트. 파일 바이트는 서버를 지나지 않는다 — 브라우저가 서명된 PUT 주소로 저장소에
// 직접 올리고, 서버는 메타데이터(크기 · 형식 · 서명에 묶인 sha256)로 다시 확인한 뒤 `incoming/` → `evidence/`로 옮긴다.
// 04.3 서명 이미지 포트(lib/storage/signature-store.ts — put · get · delete)와는 다른 포트다: 증빙은 서명 주소 · 메타데이터
// 재확인 · move · retain이 필요해 그 포트를 넓히지 않는다. gcs 드라이버(05-12)는 lib/gcp/gcs.ts의 인증 요청을 재사용한다.

export type ObjectMetadata = { size: number; contentType: string; sha256: string | null };

export type SignedPut = { url: string; method: "PUT"; headers: Record<string, string> };

export type ObjectStorage = {
  // 서명 조건 = 형식 · 크기 상한 · sha256 메타. 브라우저는 돌려준 헤더를 그대로 보낸다.
  createSignedPut(key: string, opts: { contentType: string; maxBytes: number; sha256: string; expiresSec: number }): Promise<SignedPut>;
  createSignedGet(key: string, opts: { expiresSec: number; filename: string; disposition: "inline" | "attachment" }): Promise<{ url: string }>;
  // 없으면 null.
  getMetadata(key: string): Promise<ObjectMetadata | null>;
  // 원본을 대상으로 복사(대상이 있으면 덮어씀 · 형식 · sha256 메타 유지)한 뒤 원본을 지운다. 원본이 없으면 오류,
  // 원본 삭제의 「없음」은 성공(두 호출이 겹쳐도 안전).
  move(fromKey: string, toKey: string): Promise<void>;
  delete(key: string): Promise<void>;
  // 완료된 `evidence/` 객체의 보존 표식 — 1차 보호는 접두어 분리(수명 주기는 `incoming/`에만)이고 이것은 이중 방어다.
  retain(key: string): Promise<void>;
};

export class ObjectStorageNotConfiguredError extends Error {}

// 환경별 드라이버 선택 — local 드라이버는 05-04 Task 3, gcs 드라이버는 05-12.
export function getObjectStorage(): ObjectStorage {
  throw new ObjectStorageNotConfiguredError("증빙 저장소 드라이버 미구현");
}
