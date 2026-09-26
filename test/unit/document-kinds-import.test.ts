import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 04.1-02(CEO-3 · B-A3): 문서 종류 등록은 side-effect import 순서에 기대지 않는다.
// `@/domain/approvals`(하위 경로 포함)나 `@/domain/leave/resubmit`을 **런타임으로**
// import하는 app 서버 파일은 종류 등록 한 곳 `app/(app)/document-kinds.ts`도 import한다.
// `import type`은 세지 않는다(import-cycles.test.ts의 `(type\s+)?` 관례). "use client"
// 파일은 이 조건에서 빠지는 대신 두 모듈을 런타임 import하지 않는다 — 클라이언트
// 번들에 document-kinds → @/domain/leave → DB 코드를 끌어오지 않게.

const ROOT = process.cwd();
const APP_DIR = resolve(ROOT, "app");
const DOCUMENT_KINDS = "app/(app)/document-kinds.ts";

type SourceFile = { path: string; source: string };

const RUNTIME_TARGET = /^import\s+(?!type\s)(?:[\s\S]*?\s+from\s+)?["'](@\/domain\/approvals(?:\/[^"']*)?|@\/domain\/leave\/resubmit)["']/gm;
const DOCUMENT_KINDS_IMPORT = /^import\s+["'](?:@\/app\/\(app\)\/|\.{1,2}\/(?:\.\.\/)*)document-kinds["']/m;

function isClientFile(source: string): boolean {
  const firstStatement = source
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line !== "" && !line.startsWith("//") && !line.startsWith("/*") && !line.startsWith("*"));
  return firstStatement === '"use client";' || firstStatement === "'use client';" || firstStatement === '"use client"';
}

function importsApprovalModulesAtRuntime(source: string): boolean {
  return [...source.matchAll(RUNTIME_TARGET)].length > 0;
}

// (경로, 소스) 목록 → 위반 목록. (a) 서버 파일인데 document-kinds 없음 · (d) 클라이언트 파일의 런타임 import.
export function documentKindsViolations(files: SourceFile[]): string[] {
  const violations: string[] = [];
  for (const file of files) {
    if (!importsApprovalModulesAtRuntime(file.source)) continue;
    if (isClientFile(file.source)) {
      violations.push(`(d) "use client" 파일이 결재 모듈을 런타임 import: ${file.path}`);
    } else if (!DOCUMENT_KINDS_IMPORT.test(file.source)) {
      violations.push(`(a) document-kinds import 없음: ${file.path}`);
    }
  }
  return violations;
}

function appSourceFiles(dir: string): SourceFile[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return appSourceFiles(full);
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    return [{ path: relative(ROOT, full), source: readFileSync(full, "utf8") }];
  });
}

describe("검출기 사례 (B-A3)", () => {
  it('"use client" + import type만 → 위반 없음(오탐 아님)', () => {
    const source = '"use client";\n\nimport type { ApprovalViewDto } from "@/domain/approvals";\n';
    expect(documentKindsViolations([{ path: "app/x/client.tsx", source }])).toEqual([]);
  });

  it("서버 파일의 import type만 → 위반 없음", () => {
    const source = 'import type { ApprovalViewDto } from "@/domain/approvals/dto";\nexport const x = 1;\n';
    expect(documentKindsViolations([{ path: "app/x/server.ts", source }])).toEqual([]);
  });

  it("서버 파일이 @/domain/approvals/… 런타임 import + document-kinds 없음 → (a) 위반", () => {
    const source = 'import { approveDocument } from "@/domain/approvals/index";\n';
    expect(documentKindsViolations([{ path: "app/x/actions.ts", source }])).toEqual([
      "(a) document-kinds import 없음: app/x/actions.ts",
    ]);
  });

  it("서버 파일이 document-kinds를 함께 import하면 → 위반 없음", () => {
    const source = 'import "@/app/(app)/document-kinds";\nimport { listMyInbox } from "@/domain/approvals";\n';
    expect(documentKindsViolations([{ path: "app/x/page.tsx", source }])).toEqual([]);
  });

  it('"use client" 파일이 @/domain/approvals · @/domain/leave/resubmit을 런타임 import → (d) 위반', () => {
    const approvals = '"use client";\nimport { approveDocument } from "@/domain/approvals";\n';
    const resubmit = '"use client";\nimport { resubmitLeave } from "@/domain/leave/resubmit";\n';
    expect(
      documentKindsViolations([
        { path: "app/x/a.tsx", source: approvals },
        { path: "app/x/b.tsx", source: resubmit },
      ]),
    ).toEqual([
      '(d) "use client" 파일이 결재 모듈을 런타임 import: app/x/a.tsx',
      '(d) "use client" 파일이 결재 모듈을 런타임 import: app/x/b.tsx',
    ]);
  });
});

describe("app 아래 실제 파일 (CEO-3)", () => {
  const files = appSourceFiles(APP_DIR);

  it("(a)(d) 결재 모듈을 런타임 import하는 서버 파일은 전부 document-kinds를 import하고, 클라이언트 파일은 런타임 import가 없다", () => {
    const violations = documentKindsViolations(files);
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("(b) document-kinds.ts 자신은 @/domain/leave를 import한다", () => {
    const source = readFileSync(resolve(ROOT, DOCUMENT_KINDS), "utf8");
    expect(source).toMatch(/^import\s+["']@\/domain\/leave["'];?$/m);
  });

  it("(c) 조건 (a)에 걸린 서버 파일이 1개 이상이다(공허한 통과 방지)", () => {
    const callers = files.filter((file) => !isClientFile(file.source) && importsApprovalModulesAtRuntime(file.source));
    expect(callers.length).toBeGreaterThan(0);
  });
});
