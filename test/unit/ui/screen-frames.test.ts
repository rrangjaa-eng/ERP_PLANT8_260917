import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 화면 틀 스캔 + 래칫(04.6 SC 2 · 공통 §3 · §4 (b)):
//  · 모든 app/**/page.tsx는 ListScreen 또는 DetailScreen을 쓰거나 「화면 틀」 이관 전 표시를 단다.
//  · 어떤 app/** 파일도 PageHeader를 직접 import하지 않거나 표시를 단다.
//  · 표시가 있는데 이미 조건을 만족하면 실패한다(옮겼으면 표시를 떼라).
// 표시는 scripts/design/mark-legacy.mjs --add가 넣는다. 이 경로(test/unit/ui)는 eslint boundaries가 ui 유형이라
// scripts를 import할 수 없어 스캔 로직을 이 파일에 자급한다.

const ROOT = process.cwd();
const MARKER = "// 04.6 스킨 A 이관 전: 화면 틀";

// 셸 없는 화면 — 화면 틀을 요구하지 않는 경로(PageHeader 직접 import 금지는 여기도 적용된다)
const EXEMPT = [
  { prefix: "app/(auth)/", reason: "로그인 — 셸 없는 인증 폼(SYSTEM §6-7)" },
  { prefix: "app/c/", reason: "외부 수령자 화면 — 셸 없음(04.3, SYSTEM §6-5)" },
  { prefix: "app/print/", reason: "인쇄 라우트 — 인쇄 영구 예외, 화면 틀 없음" },
];

const PAGE_HEADER_IMPORT = /from\s+["'][^"']*ui\/page-header\/PageHeader["']/;
const FRAME_IMPORT = /from\s+["'][^"']*ui\/(?:list-screen\/ListScreen|detail-screen\/DetailScreen)["']/;

const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const files = readdirSync(resolve(ROOT, "app"), { recursive: true, encoding: "utf8" })
  .map((f) => `app/${f.split("\\").join("/")}`)
  .filter((f) => f.endsWith(".tsx"))
  .sort();
const pages = files.filter((f) => f.endsWith("/page.tsx"));
const isExempt = (f: string) => EXEMPT.some((e) => f.startsWith(e.prefix));

function violations(rel: string, text: string): string[] {
  const reasons: string[] = [];
  if (PAGE_HEADER_IMPORT.test(text)) reasons.push("PageHeader 직접 import");
  if (rel.endsWith("/page.tsx") && !isExempt(rel) && !FRAME_IMPORT.test(text)) {
    reasons.push("ListScreen·DetailScreen 미사용");
  }
  return reasons;
}

const hasMarker = (text: string) =>
  text
    .split("\n", 3)
    .map((l) => l.trimEnd())
    .includes(MARKER);

const stripMarker = (text: string) => {
  const lines = text.split("\n");
  const at = lines.slice(0, 3).findIndex((l) => l.trimEnd() === MARKER);
  if (at !== -1) lines.splice(at, 1);
  return lines.join("\n");
};

describe("화면 틀 스캔", () => {
  it("훑은 page.tsx가 28개 이상이다(공허 방지)", () => {
    expect(pages.filter((p) => !isExempt(p)).length).toBeGreaterThanOrEqual(28);
  });

  it("셸 없는 예외 경로마다 실제 page가 있다", () => {
    for (const e of EXEMPT) {
      expect(pages.some((p) => p.startsWith(e.prefix)), `${e.prefix} — ${e.reason}`).toBe(true);
    }
  });

  it("틀을 안 쓰는 page.tsx · PageHeader를 직접 import하는 파일은 화면 틀 표시가 있다", () => {
    const missing = files.filter((f) => {
      const text = read(f);
      return violations(f, text).length > 0 && !hasMarker(text);
    });
    expect(missing, `화면 틀 표시가 없는 위반 파일: ${missing.join(", ")}`).toEqual([]);
  });

  it("판정 규칙: 틀 import는 통과 · 틀 없는 page와 PageHeader import는 위반 · 예외 경로 page는 틀 없이 통과", () => {
    const list = `import { ListScreen } from "@/ui/list-screen/ListScreen";\n`;
    const detail = `import { DetailScreen } from "@/ui/detail-screen/DetailScreen";\n`;
    const header = `import { PageHeader } from "@/ui/page-header/PageHeader";\n`;
    const bare = "export default function P() { return null; }\n";
    expect(violations("app/(app)/x/page.tsx", list)).toEqual([]);
    expect(violations("app/(app)/x/page.tsx", detail)).toEqual([]);
    expect(violations("app/(app)/x/page.tsx", bare)).toHaveLength(1);
    expect(violations("app/(app)/x/loading.tsx", header)).toHaveLength(1);
    expect(violations("app/c/[token]/page.tsx", bare)).toEqual([]);
    expect(violations("app/c/[token]/page.tsx", header)).toHaveLength(1);
  });
});

describe("화면 틀 이관 전 표시 래칫(공통 §3)", () => {
  const marked = files.filter((f) => hasMarker(read(f)));

  it("표시 파일 수가 28 이상이다(공허 방지)", () => {
    expect(marked.length).toBeGreaterThanOrEqual(28);
  });

  it("표시를 떼도 위반이 0건인 파일이 없다 — 있으면 표시를 지워라", () => {
    const stale = marked.filter((f) => violations(f, stripMarker(read(f))).length === 0);
    expect(stale, `위반이 없는데 표시가 남은 파일: ${stale.join(", ")}`).toEqual([]);
  });

  it("표시 문구는 공통 §3 형식 하나뿐이다", () => {
    for (const f of marked) {
      const lines = read(f)
        .split("\n", 3)
        .filter((l) => l.includes("화면 틀") && l.includes("이관 전"));
      expect(lines, f).toEqual([MARKER]);
    }
  });
});
