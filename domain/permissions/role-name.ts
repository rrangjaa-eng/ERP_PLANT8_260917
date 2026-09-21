// 계급 이름 정규화만 담은 잎(leaf) 모듈. 다른 import를 두지 않는다 —
// domain/permissions/roles.ts는 @/repositories/roles를 import하는데,
// repositories/roles.ts도 이 함수를 써야 해서 둘이 서로를 부르는 런타임 순환이
// 생겼다. esbuild ESM 번들(scripts/build-cli.mjs)에서 그 순환은 풀리지 않는
// top-level await가 되어 seed·account Cloud Run Job이 "Detected unsettled
// top-level await"로 아무 일도 하지 않고 exit 13 했다(실측).
// domain/action-log/filter-keys.ts와 같은 결의 분리다.

// 계급 이름 중복 판정은 Unicode NFC 정규화 후에 한다 — 조합형(NFD)·완성형(NFC)으로
// 적은 같은 한글 이름이 같은 이름으로 취급된다. DB의 UNIQUE 제약과 짝을 이룬다.
export function normalizeRoleName(name: string): string {
  return name.normalize("NFC").trim();
}
