import { readFileSync, readdirSync, type Dirent } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

// ADMN-05: "등록됐지만 서버가 읽지 않는 키가 있으면 테스트가 실패한다" —
// 정적 분석(AST) 대신 소스 검색으로 구현한다(03-RESEARCH.md §5, ci-guard.test.ts
// 전례와 같은 결). domain/settings/keys.ts의 export const 이름 목록을 뽑고,
// 각 이름이 domain/settings/ 밖의 프로덕션 디렉터리에서 한 번 이상 참조되는지
// 확인한다.
//
// readBy 표시가 있는 키는 위반이 아니다 — ROADMAP이 세율·면제 기준·절사
// 기본값을 Phase 3에 등록하되 읽는 주체는 Phase 4의 금액 모듈이라고 지정해
// 예외 없이는 두 요구가 모순이기 때문이다. 다만 표시된 페이즈가 ROADMAP에
// 실재하는지는 검사하고(남용 방지), 목록을 console.info로 출력해 표시가
// 늘어나는 것을 사람 눈에 보이게 한다.

const ROOT = process.cwd();
const KEYS_FILE = resolve(ROOT, "domain/settings/keys.ts");
const ROADMAP_FILE = resolve(ROOT, ".planning/ROADMAP.md");
const SCAN_DIRS = ["domain", "repositories", "lib", "app", "scripts"];
const EXCLUDED_DIR_SEGMENT = join("domain", "settings");

type ParsedDef = { name: string; readByPhase: string | null };

function parseDefs(src: string): ParsedDef[] {
  const constRegex = /export const ([A-Z][A-Z0-9_]*): SettingDef<[^;]*?>\s*=\s*\{/g;
  const starts: Array<{ name: string; index: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = constRegex.exec(src)) !== null) {
    starts.push({ name: match[1] ?? "", index: match.index });
  }
  return starts.map(({ name, index }, i) => {
    const next = starts[i + 1];
    const end = next ? next.index : src.length;
    const block = src.slice(index, end);
    const readByMatch = block.match(/readBy:\s*\{\s*phase:\s*"(\d+)"\s*\}/);
    return { name, readByPhase: readByMatch?.[1] ?? null };
  });
}

function listSourceFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: Dirent<string>[];
  try {
    entries = readdirSync(dir, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || full.includes(EXCLUDED_DIR_SEGMENT)) continue;
      results.push(...listSourceFiles(full));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      results.push(full);
    }
  }
  return results;
}

function isReferencedOutsideSettings(name: string): boolean {
  const pattern = new RegExp(`\\b${name}\\b`);
  for (const dir of SCAN_DIRS) {
    const files = listSourceFiles(resolve(ROOT, dir));
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      if (pattern.test(content)) return true;
    }
  }
  return false;
}

describe("등록됐지만 읽히지 않는 설정 키 검출 (ADMN-05)", () => {
  const src = readFileSync(KEYS_FILE, "utf8");
  const defs = parseDefs(src);

  it("domain/settings/keys.ts에서 정의를 하나 이상 파싱했다(파서 자체가 죽어있지 않다)", () => {
    expect(defs.length).toBeGreaterThan(0);
  });

  it("참조되지 않고 readBy 표시도 없는 키가 없다", () => {
    const violations = defs
      .filter((def) => def.readByPhase === null)
      .filter((def) => !isReferencedOutsideSettings(def.name))
      .map((def) => def.name);
    expect(violations, `미사용 키: ${violations.join(", ")}`).toEqual([]);
  });

  const readByDefs = defs.filter((def) => def.readByPhase !== null);

  it("readBy로 표시된 키 목록을 출력한다(표시 증가를 사람 눈에 보이게 한다)", () => {
    console.info(
      "readBy 표시된 설정 키:",
      readByDefs.map((def) => `${def.name}(phase ${def.readByPhase})`).join(", ") || "(없음)",
    );
    expect(Array.isArray(readByDefs)).toBe(true);
  });

  // readBy 표시는 "미래 페이즈가 읽을 것"이라는 약속이다. 그 페이즈가 실제로
  // 읽기 시작하면 약속은 이행됐고 표시는 거짓이 된다. 남겨 두면 면제가 영구화되어
  // ADMN-05의 미사용 키 검출이 시간이 갈수록 무력해진다 — 면제는 쌓이기만 하고
  // 줄지 않는다. 이미 읽히는 키의 표시를 실패로 잡아 면제가 스스로 청소되게 한다.
  it("readBy 표시가 남은 키는 아직 settings 밖에서 읽히지 않는다(표시 만료 강제)", () => {
    const stale = readByDefs
      .filter((def) => isReferencedOutsideSettings(def.name))
      .map((def) => `${def.name}(phase ${def.readByPhase})`);
    expect(
      stale,
      `이미 읽히고 있으므로 readBy 표시를 지워야 한다: ${stale.join(", ")}`,
    ).toEqual([]);
  });

  it.each(readByDefs.map((def) => [def.name, def.readByPhase] as const))(
    "%s의 readBy 페이즈 %s가 ROADMAP.md에 실재한다",
    (_name, phase) => {
      const roadmap = readFileSync(ROADMAP_FILE, "utf8");
      expect(roadmap).toMatch(new RegExp(`^### Phase ${phase}:`, "m"));
    },
  );
});
