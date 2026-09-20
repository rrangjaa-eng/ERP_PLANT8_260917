import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { describe, expect, it } from "vitest";

// D-37(03-CONTEXT.md): users.is_admin 컬럼 자체는 드롭하지 않는다(.squawk.toml의
// ban-drop-column이 예외 목록에 없어 DROP COLUMN이 거부된다 — 03-RESEARCH.md §3
// 실측). 컬럼은 남기되 "참조 0"을 이 테스트로 고정한다 — 이중 관리(옛 불리언과
// 새 판정 함수가 공존하는 상태)가 다시 생기면 이 테스트가 즉시 실패한다.
//
// 이 파일은 test/unit/ci-guard.test.ts(외부 소스를 읽어 루프로 단언)와
// test/unit/docs-limits.test.ts(파일을 읽어 줄 수·토큰을 단언)의 구조를 합친
// 메타 테스트다.

const ROOT = process.cwd();
const SELF_RELATIVE = "test/unit/no-admin-boolean.test.ts";

// 검사 대상 디렉터리 — 그 안의 .ts·.tsx·.mjs 전부.
const TARGET_DIRS = ["domain", "repositories", "lib", "ui", "app", "scripts", "test", "eslint"];

// 제외 목록:
// - db/** 전체 — D-37이 남긴 잔여 컬럼 정의(db/schema/auth.ts)와 그 컬럼을
//   만든 마이그레이션이 여기 있다. 컬럼은 남기고 참조를 없애는 것이 D-37의
//   결정이라 db/는 애초에 TARGET_DIRS에 없다(위 목록 참고).
// - 이 테스트 파일 자신 — 금지 문자열을 예시·주석으로 반드시 담기 때문이다.
// - node_modules·.next·.claude·playwright-report·test-results·
//   test/unit/eslint-rules/fixtures — eslint.config.mjs의 globalIgnores와 같은 목록.
// - test/integration/roles.test.ts — D-37 백필 규칙(마이그레이션 0003의 UPDATE
//   두 문장)을 재현해 검증하는 테스트라 잔여 컬럼(관리자 여부 불리언)을 직접
//   읽고 쓴다. db/schema/auth.ts와 같은 이유로 예외다 — 판정 코드가 아니라
//   "그 컬럼이 실제로 존재하고 백필된다"는 사실 자체를 검사한다.
const EXCLUDED_DIR_SEGMENTS = new Set([
  "node_modules",
  ".next",
  ".claude",
  "playwright-report",
  "test-results",
]);
const EXCLUDED_FILES = new Set([SELF_RELATIVE, "test/unit/eslint-rules/fixtures", "test/integration/roles.test.ts"]);

const FORBIDDEN_PATTERNS = ["isAdmin", "is_admin"];

function isExcludedPath(relPath: string): boolean {
  if (EXCLUDED_FILES.has(relPath)) return true;
  const segments = relPath.split("/");
  if (segments.some((segment) => EXCLUDED_DIR_SEGMENTS.has(segment))) return true;
  // test/unit/eslint-rules/fixtures/** — 디렉터리 전체를 문자열 접두어로 제외.
  if (relPath.startsWith("test/unit/eslint-rules/fixtures/")) return true;
  return false;
}

function collectFiles(dir: string, acc: string[] = []): string[] {
  let entries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    // 대상 디렉터리가 아직 없으면(예: 이 리포에 eslint/ 디렉터리가 없는 경우) 조용히 건너뛴다.
    return acc;
  }
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    const relPath = relative(ROOT, fullPath).split("\\").join("/");
    if (isExcludedPath(relPath)) continue;
    if (entry.isDirectory()) {
      collectFiles(fullPath, acc);
    } else if (/\.(ts|tsx|mjs)$/.test(entry.name)) {
      acc.push(fullPath);
    }
  }
  return acc;
}

function findViolations(): string[] {
  const violations: string[] = [];
  for (const dir of TARGET_DIRS) {
    const files = collectFiles(resolve(ROOT, dir));
    for (const file of files) {
      const relPath = relative(ROOT, file).split("\\").join("/");
      const content = readFileSync(file, "utf8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        for (const pattern of FORBIDDEN_PATTERNS) {
          if (line.includes(pattern)) {
            violations.push(`${relPath}:${i + 1}`);
            break;
          }
        }
      }
    }
  }
  return violations;
}

describe("관리자 불리언 참조 0 (D-36 이관 완료, D-37 잔여 컬럼 정책)", () => {
  it("domain·repositories·lib·ui·app·scripts·test·eslint 아래 isAdmin/is_admin 참조가 0건이다", () => {
    const violations = findViolations();
    // 실패 메시지가 곧 남은 작업 목록이다(설계 목적) — 개수만 세지 않는다.
    expect(violations).toEqual([]);
  });
});
