import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 04.5-04(UI-SPEC O21 · 디자인 리뷰 R5): 칸 정의의 보관 · 복원 권한은 domain/archive 한 곳에서 판정한다.
// 보관함 서버 액션("use server" → server-only)은 Vitest가 import하지 못해 소스로 지킨다 — 복원 액션이
// 자체 권한 판정이나 다른 쓰기 경로 없이 domain restore()만 부르면, (a) 통합 테스트의 domain 거부가
// 액션 경로에도 그대로 성립한다. 실제 액션 경유 거부는 E2E(field-definitions.spec.ts)가 증명한다.
function code(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");
}

function actionBody(src: string, name: string): string {
  const start = src.indexOf(`export const ${name}`);
  if (start < 0) return "";
  const next = src.indexOf("export const ", start + 1);
  return src.slice(start, next < 0 ? src.length : next);
}

describe("보관함 복원 액션은 domain restore()만 부른다 (04.5-04 (b))", () => {
  const ARCHIVE_ACTIONS = code("app/(app)/admin/archive/actions.ts");
  const body = actionBody(ARCHIVE_ACTIONS, "restoreArchivedAction");

  it("복원 액션 본문을 찾았고 domain restore(를 부른다", () => {
    expect(body).not.toBe("");
    expect(body).toContain("await restore(ctx.viewer, parsedInput.entity, parsedInput.id)");
  });

  it("자체 권한 판정(can()) · 리포지토리 import가 없다", () => {
    expect(ARCHIVE_ACTIONS).not.toMatch(/\bcan\(/);
    expect(ARCHIVE_ACTIONS).not.toMatch(/from "@\/repositories\//);
  });
});

// 04.5-04 Task 2(디자인 리뷰 R6 · R8 · D6 · D8): 이 저장소에 React 렌더 테스트 러너가 없어(새 의존성 없음) 페이지의
// 렌더 조건을 소스로 지킨다 — 권한 조합별 실제 렌더는 E2E(field-definitions.spec.ts)가 증명한다.
describe("화면 항목 목록 — 「삭제」 · EMPTY 조건 (04.5-04)", () => {
  const PAGE = code("app/(app)/admin/field-definitions/page.tsx");

  it("「삭제」는 보관함 쓰기와 칸 관리 쓰기의 AND일 때만, 보관 행이 아닐 때만 렌더한다", () => {
    expect(PAGE).toContain('can(session.viewer, "admin.archive", "write")');
    expect(PAGE).toContain('can(session.viewer, "admin.field-definitions", "write")');
    expect(PAGE).toMatch(/const canDelete = canWrite && canArchiveWrite;/);
    expect(PAGE).toMatch(/\{canDelete \? <FieldDefinitionDeleteButton /);
    expect(PAGE.match(/<FieldDefinitionDeleteButton /g)).toHaveLength(1);
    // 보관 행은 동작 칸에 「보관됨」만(폰) — 「수정」 · 「삭제」 분기는 보관 아님 갈래 안에 있다.
    expect(PAGE).toMatch(/def\.archived \? \([\s\S]*?\) : \([\s\S]*?canDelete \? <FieldDefinitionDeleteButton /);
  });

  it("전체 0건 EMPTY의 「화면 항목 추가」는 쓰기 권한 AND 폼 닫힘일 때만, 기본 필터 0건은 「필터 지우기」다", () => {
    expect(PAGE).toMatch(/allDefs\.length === 0 \?[\s\S]*?message="등록된 화면 항목이 없습니다"\s*action=\{canWrite && !showForm \?/);
    expect(PAGE).toMatch(/message="조건에 맞는 건이 없습니다"\s*action=\{\{ label: "필터 지우기"/);
  });

  it("목록 조회가 던지면 표 자리에 오류 한 줄과 「다시 시도」", () => {
    expect(PAGE).toMatch(/tone="error"\s*message="화면 항목 불러오기 실패"\s*action=\{\{ label: "다시 시도"/);
  });
});

describe("보관 · 복원 액션의 재검증 경로 (04.5-04)", () => {
  it("칸 보관 액션은 domain archive()로 가고 화면 항목 · 보관함 · 거래처 · 노출표를 재검증한다", () => {
    const src = code("app/(app)/admin/field-definitions/actions.ts");
    const body = actionBody(src, "archiveFieldDefinitionAction");
    expect(body).toContain('await archive(ctx.viewer, "field_definitions", parsedInput.id)');
    expect(body).toContain('revalidatePath("/admin/archive")');
    expect(body).toContain("revalidateFieldDefinitionPaths()");
    const helper = src.slice(src.indexOf("function revalidateFieldDefinitionPaths"), src.indexOf("export const "));
    for (const path of ["/admin/field-definitions", "/admin/vendors", "/admin/visibility"]) {
      expect(helper).toContain(`revalidatePath("${path}")`);
    }
  });

  it("보관함 복원 액션은 화면 항목 · 노출표도 재검증한다", () => {
    const body = actionBody(code("app/(app)/admin/archive/actions.ts"), "restoreArchivedAction");
    expect(body).toContain('revalidatePath("/admin/field-definitions")');
    expect(body).toContain('revalidatePath("/admin/visibility")');
  });

  it("칸 보관 액션은 보관함 write 메뉴로 등록된다", () => {
    const registry = code("app/(app)/admin/field-definitions/actions.registry.ts");
    expect(registry).toMatch(/name: "archiveFieldDefinitionAction",\s*menu: "admin\.archive",\s*action: "write",\s*dtoName: null/);
  });
});
