import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// 07.3-01(D-7312 · T-07.3-01-02): 자금 게이트는 can() 한 접점에 있다 — 권한표를 can() 밖에서 직접 읽는 파일 집합을 고정해
// 새 우회가 생기거나(자금 키를 직접 읽는 새 SQL · 새 호출처) 하나가 사라지면 붉어진다(row-scope-disposition.test.ts 꼴 — 허용표는 이 파일 안 상수).
//  ⓐ `permissionMatrix` 식별자를 쓰는 파일
//  ⓑ `@/repositories/permissions`에서 `findPermission` · `listPermissions`를 import하는 파일
//  ⓒ 메뉴를 인자로 받는 권한표 직독 헬퍼(`listActiveUserIdsAllowed` · `listRoleGrantRows` · `listMenuWriterIds` · `listPaymentManagerIds`)를 import하는 파일
//     — ⓐ · ⓑ만으로는 새 파일이 `listMenuWriterIds(v, "expenses.payments")`를 불러도 녹색이다.

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "domain", "lib", "repositories", "scripts"];

const NOTIFY_LATER = "07.3-02가 domain/notify/recipients.ts에서 자금 본부 소속 ∪ 회사 전체 계급과 교집합으로 정렬한다(B1 · B2 — 알림 tick 잠금 tx 안이라 can()을 못 부른다)";

const MATRIX_IDENTIFIER_ALLOW: Record<string, string> = {
  "repositories/permissions.ts": "권한표 리포지토리 자체(findPermission · listPermissions · 권한표 화면 쓰기) — can()이 읽는 정본",
  "repositories/notify-sources.ts": `알림 받는 사람 직독(listPaymentManagerIds B1 · listMenuWriterIds B2) — ${NOTIFY_LATER}`,
  "repositories/users.ts": "사람 목록의 관리자 열(admin.permissions write) — 자금 키 아님",
  "repositories/team-memberships.ts": "teamLeadCandidatesAtDate — 메뉴가 projects.status · projects.period 타입으로 묶인 팀장 후보 문구 — 자금 키 아님",
};

const DIRECT_READ_ALLOW: Record<string, string> = {
  "domain/permissions/can.ts": "판정 접점 자체 — 권한 행 뒤에 자금 게이트를 건다",
  "domain/permissions/last-admin.ts": "마지막 관리자 지킴(admin.permissions write) — 자금 키 아님",
  "domain/permissions/matrix.ts": "권한표 화면 읽기 · 쓰기(admin.permissions) — 판정이 아니라 표 편집",
  "domain/seed/index.ts": "B4 시드 — evidence.intake 허용 행을 읽어 evidence 보기 행을 넣는다(허용 행 직독이 맞다 · 무해)",
};

const MENU_HELPER_ALLOW: Record<string, string> = {
  "domain/projects/members.ts": "참여자 후보 = projects 보기 — 자금 키 아님",
  "domain/certs/intake.ts": "확인증 알림 받는 사람 = certs 키 — 자금 키 아님",
  "domain/certs/events.ts": "QR 요청 알림 받는 사람 = certs.qr — 자금 키 아님(D-7308 · 본부 조건 없음)",
  "domain/notify/recipients.ts": `지급 알림 받는 사람(listPaymentManagerIds B1) — ${NOTIFY_LATER}`,
  "domain/notify/kinds/orphan-evidence.ts": `미연결 증빙 알림 받는 사람(listMenuWriterIds B2 · evidence.intake) — ${NOTIFY_LATER}`,
  "domain/permissions/grant-ceiling.ts": "계급 편집 상한(권한 행 전체 비교) — 판정이 아니라 관리자 쓰기 상한",
};

const DIRECT_READ_NAMES = ["findPermission", "listPermissions"];
const MENU_HELPER_NAMES = ["listActiveUserIdsAllowed", "listRoleGrantRows", "listMenuWriterIds", "listPaymentManagerIds"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      out.push(...sourceFiles(path));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      out.push(relative(ROOT, join(ROOT, path)));
    }
  }
  return out;
}

const FILES = SCAN_DIRS.flatMap(sourceFiles);
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");
const withoutLineComments = (source: string) => source.replace(/^\s*\/\/.*$/gm, "");

// import { a, b as c } from "module" — 여러 줄 · type 수식어 포함. 값 import만 센다(`import type`은 읽기가 아니다).
function importedNames(source: string, modules: readonly string[]): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    if (match[1] || !modules.includes(match[3] ?? "")) continue;
    for (const part of (match[2] ?? "").split(",")) {
      const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]?.trim();
      if (name && !part.trim().startsWith("type ")) names.push(name);
    }
  }
  return names;
}

const sorted = (values: Iterable<string>) => [...values].sort();

describe("자금 게이트 우회 스캔 (07.3-01)", () => {
  it("ⓐ permissionMatrix 식별자를 쓰는 파일 = 허용표", () => {
    const hits = FILES.filter((file) => /\bpermissionMatrix\b/.test(withoutLineComments(read(file))));
    expect(sorted(hits)).toEqual(sorted(Object.keys(MATRIX_IDENTIFIER_ALLOW)));
  });

  it("ⓑ @/repositories/permissions에서 findPermission · listPermissions를 import하는 파일 = 허용표", () => {
    const hits = FILES.filter((file) => importedNames(read(file), ["@/repositories/permissions"]).some((name) => DIRECT_READ_NAMES.includes(name)));
    expect(sorted(hits)).toEqual(sorted(Object.keys(DIRECT_READ_ALLOW)));
  });

  it("ⓒ 메뉴를 받는 권한표 직독 헬퍼를 import하는 파일 = 허용표", () => {
    const modules = ["@/repositories/permissions", "@/repositories/notify-sources"];
    const hits = FILES.filter((file) => importedNames(read(file), modules).some((name) => MENU_HELPER_NAMES.includes(name)));
    expect(sorted(hits)).toEqual(sorted(Object.keys(MENU_HELPER_ALLOW)));
  });

  it("허용표 줄마다 이유가 있다", () => {
    for (const reason of [...Object.values(MATRIX_IDENTIFIER_ALLOW), ...Object.values(DIRECT_READ_ALLOW), ...Object.values(MENU_HELPER_ALLOW)]) {
      expect(reason.length).toBeGreaterThan(10);
    }
  });
});
