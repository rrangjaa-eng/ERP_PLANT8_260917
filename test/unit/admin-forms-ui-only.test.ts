import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

// 07-08 N10 · D-713 · SC-15 측정 계약 — 관리자 폼과 내 계정은 `ui/` 밖 네이티브 `select` · `input`(체크박스 · 라디오 · hidden 제외)을
// 쓰지 않는다. 파일마다 JSX의 그 요소를 세고, 1 이상인 파일은 영구 제외 또는 「맡은 플랜 대기」 목록에 이름과 이유가 있어야 한다.
// 07-25가 대기 목록을 비워 최종 0을 단언한다(그 전까지 대기 목록의 파일은 맡은 플랜이 고치면서 목록에서 지운다).
const ROOT = process.cwd();
const SCAN_DIRS = ["app/(app)/admin", "app/(app)/account"];

// 표 안 입력 · 필터 줄은 폼이 아니라 이관 대상에서 뺀다(CONTEXT 관리자 폼 줄 · SC-15).
export const UI_ONLY_EXCLUDED: Record<string, string> = {
  "app/(app)/admin/action-log/filter-bar.tsx": "필터 줄 select — 폼이 아니다(SC-15 제외)",
  "app/(app)/admin/code-tables/code-item-form.tsx": "코드표 인라인 blur 칸 — 표 안 입력이다(SC-15 제외)",
  "app/(app)/admin/people/page.tsx": "필터 줄 검색칸(ListScreen filters · GET ?q=) — 폼이 아니다(SC-15 제외, 07-17 PLAN N10 범위)",
  "app/(app)/admin/vendors/vendor-search.tsx": "거래처 목록 필터 줄 검색칸 — 폼이 아니다(SC-15 제외, 07-20 V2)",
  "app/(app)/admin/people/roles/roles-client.tsx": "표 안 입력 — CONTEXT 관리자 폼 줄 · 07-21 N10 배정(계급 표 안 이름 · 업무 범위 · 보는 범위 칸 셋)",
  "app/(app)/admin/people/org/org-client.tsx": "표 안 입력 — CONTEXT 관리자 폼 줄 · 07-21 N10 배정(`RenameInput` 줄 안 blur 칸 하나). 폼 입력(`팀 추가` 본부 select)은 `ui/select`로 이관됨",
};

// 07-25: 파일째 빼면 같은 파일의 폼 입력이 가려진다 — 표 안 입력 파일은 허용 개수를 둬 그 수를 넘는 입력(예 org-client `팀 추가` 본부 select를 네이티브로 되돌림)은 빨갛게 한다.
// 이 표에 없는 영구 제외 파일은 개수 제한 없이 07-08 꼴 그대로다.
export const UI_ONLY_EXCLUDED_MAX: Record<string, number> = {
  "app/(app)/admin/people/roles/roles-client.tsx": 3,
  "app/(app)/admin/people/org/org-client.tsx": 1,
};

// 맡은 플랜이 이관하면서 이 목록에서 지운다. 07-25가 비웠다(N10 마무리) — 다시 채우지 않는다. 남은 파일은 그 맡은 플랜의 미완이다.
export const UI_ONLY_PENDING: Record<string, string> = {};

const EXEMPT_INPUT_TYPES = new Set(["checkbox", "radio", "hidden"]);

function listTsx(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) results.push(...listTsx(full));
    else if (entry.endsWith(".tsx")) results.push(full);
  }
  return results;
}

// JSX 태그 `select` · `input` 중 type이 리터럴 checkbox · radio · hidden이 아닌 것의 수. type이 식으로 오면 세어 둔다(보수적).
export function countNativeInputs(source: string): number {
  const file = ts.createSourceFile("file.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let count = 0;
  const check = (node: ts.JsxOpeningElement | ts.JsxSelfClosingElement) => {
    const tag = node.tagName.getText(file);
    if (tag === "select") {
      count++;
      return;
    }
    if (tag !== "input") return;
    const typeAttr = node.attributes.properties.find(
      (property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText(file) === "type",
    );
    const initializer = typeAttr?.initializer;
    if (initializer && ts.isStringLiteral(initializer) && EXEMPT_INPUT_TYPES.has(initializer.text)) return;
    count++;
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) check(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return count;
}

const counts = new Map<string, number>();
for (const dir of SCAN_DIRS) {
  for (const full of listTsx(resolve(ROOT, dir))) {
    counts.set(relative(ROOT, full).split("\\").join("/"), countNativeInputs(readFileSync(full, "utf8")));
  }
}

describe("관리자 폼 · 내 계정의 ui/ 밖 네이티브 입력 계수 (07-08 N10 · SC-15)", () => {
  it("계수 틀이 체크박스 · 라디오 · hidden은 세지 않고 select · 그 밖 input은 센다", () => {
    const source = `
      const a = <input type="checkbox" />;
      const b = <input type="radio" />;
      const c = <input type="hidden" />;
      const d = <input type="text" />;
      const e = <input />;
      const f = <select></select>;
      const g = <Select />;
      const h = <TextField />;
      const i = <input type={kind} />;
    `;
    expect(countNativeInputs(source)).toBe(4);
  });

  it("07-08 몫 다섯 폼에 ui/ 밖 네이티브 입력이 없다", () => {
    const mine = [
      "app/(app)/admin/settings/settings-form-client.tsx",
      "app/(app)/account/change-password-form.tsx",
      "app/(app)/admin/holidays/holiday-form.tsx",
      "app/(app)/admin/corp-cards/card-form.tsx",
      "app/(app)/admin/code-tables/evidence-type-fields.tsx",
    ];
    for (const path of mine) {
      expect(counts.has(path), `${path}가 계수 대상 폴더에 없다`).toBe(true);
      expect(counts.get(path), `${path}에 ui/ 밖 네이티브 입력 남음`).toBe(0);
    }
  });

  it("07-17 몫 세 폼에 ui/ 밖 네이티브 입력이 없고 대기 목록에서 지웠다", () => {
    const mine = [
      "app/(app)/admin/people/person-form.tsx",
      "app/(app)/admin/people/[id]/person-detail-client.tsx",
      "app/(app)/admin/people/[id]/leave-section.tsx",
    ];
    for (const path of mine) {
      expect(counts.get(path), `${path}에 ui/ 밖 네이티브 입력 남음`).toBe(0);
      expect(path in UI_ONLY_PENDING, `${path}가 아직 대기 목록에 있다`).toBe(false);
    }
  });

  it("1 이상인 파일은 전부 영구 제외 또는 맡은 플랜 대기 목록에 있다", () => {
    const listed = new Set([...Object.keys(UI_ONLY_EXCLUDED), ...Object.keys(UI_ONLY_PENDING)]);
    const unlisted = [...counts].filter(([path, count]) => count > 0 && !listed.has(path)).map(([path, count]) => `${path}(${count})`);
    expect(unlisted, `목록 밖 네이티브 입력: ${unlisted.join(", ")}`).toEqual([]);
  });

  it("제외 · 대기 목록의 키는 실제 파일 경로이고 이유가 비어 있지 않다", () => {
    for (const [name, list] of [["UI_ONLY_EXCLUDED", UI_ONLY_EXCLUDED], ["UI_ONLY_PENDING", UI_ONLY_PENDING]] as const) {
      for (const [path, reason] of Object.entries(list)) {
        expect(counts.has(path), `${name}의 ${path}가 실제 파일이 아니다`).toBe(true);
        expect(reason.trim(), `${name}의 ${path} 이유가 비었다`).not.toBe("");
      }
    }
  });

  it("N10 마무리(07-25): 대기 목록이 비었다", () => {
    expect(Object.keys(UI_ONLY_PENDING)).toHaveLength(0);
  });

  it("N10 마무리(07-25): 영구 제외 밖의 admin · account 파일에 ui/ 밖 select · input이 0이다", () => {
    const outside = [...counts].filter(([path, count]) => count > 0 && !(path in UI_ONLY_EXCLUDED)).map(([path, count]) => `${path}(${count})`);
    expect(outside, `제외 밖 네이티브 입력: ${outside.join(", ")}`).toEqual([]);
  });

  it("표 안 입력 파일(roles-client · org-client)은 허용 개수를 넘는 입력이 없다 — 파일째 가리지 않는다", () => {
    for (const [path, max] of Object.entries(UI_ONLY_EXCLUDED_MAX)) {
      expect(path in UI_ONLY_EXCLUDED, `${path}가 영구 제외에 없다`).toBe(true);
      expect(counts.get(path), `${path}에 허용 ${max}개를 넘는 네이티브 입력(폼 입력이 ui/ 밖으로 돌아갔다)`).toBeLessThanOrEqual(max);
    }
    expect(Object.keys(UI_ONLY_EXCLUDED_MAX).sort()).toEqual(
      ["app/(app)/admin/people/org/org-client.tsx", "app/(app)/admin/people/roles/roles-client.tsx"],
    );
  });

  it("허용 개수 판정이 org-client에 본부 select를 네이티브로 더하면 넘친다고 본다", () => {
    const withExtraSelect = `const a = <input type="text" />; const b = <select></select>;`;
    expect(countNativeInputs(withExtraSelect)).toBeGreaterThan(UI_ONLY_EXCLUDED_MAX["app/(app)/admin/people/org/org-client.tsx"] ?? 0);
  });

  it("영구 제외 파일은 대기 목록에 겹쳐 있지 않다", () => {
    const overlap = Object.keys(UI_ONLY_EXCLUDED).filter((path) => path in UI_ONLY_PENDING);
    expect(overlap).toEqual([]);
  });

  it("파일별 계수 표를 출력한다(SUMMARY에 옮긴다)", () => {
    const table = [...counts].filter(([, count]) => count > 0).map(([path, count]) => `${count}\t${path}`);
    console.info(`ui/ 밖 네이티브 입력(체크박스 · 라디오 · hidden 제외) 파일별 계수:\n${table.join("\n")}`);
    expect(counts.size).toBeGreaterThan(0);
  });
});
