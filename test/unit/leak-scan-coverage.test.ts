import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ADMN-03의 계약은 "등록만 하면 검사가 따라온다"이다. 그런데 누수 스캔은
// actions.registry.ts들을 side-effect import로 직접 나열해서 불러온다 —
// 새 화면이 등록 파일을 만들고 이 목록에 추가하는 걸 잊으면, 그 액션들은
// 검사 대상에서 조용히 빠지고 스위트는 초록불로 남는다.
//
// 실측(03 검증): 등록 파일 9개 중 7개만 import돼 있었고, 빠진 둘이 하필
// admin/permissions·admin/visibility — 권한표·노출표 자체를 쓰는 액션이었다.
//
// 이 테스트가 그 목록을 강제한다. 통합 테스트가 아니라 단위로 두는 이유는
// DB 없이 정적으로 판정할 수 있고, CI의 단위 단계에서 더 빨리 잡히기 때문이다.

const ROOT = process.cwd();
const APP_DIR = resolve(ROOT, "app");
const LEAK_SCAN = resolve(ROOT, "test/integration/leak-scan.test.ts");

function findRegistryFiles(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findRegistryFiles(full));
    else if (entry.name === "actions.registry.ts") out.push(full);
  }
  return out;
}

// app/(app)/admin/people/actions.registry.ts → @/app/(app)/admin/people/actions.registry
function importSpecifierFor(file: string): string {
  return `@/${file.replace(`${ROOT}/`, "").replace(/\.ts$/, "")}`;
}

describe("누수 스캔이 모든 등록 파일을 본다 (ADMN-03)", () => {
  const registryFiles = findRegistryFiles(APP_DIR);
  const leakScanSource = readFileSync(LEAK_SCAN, "utf8");

  it("등록 파일을 하나 이상 찾았다(검출기 자체가 죽어있지 않다)", () => {
    expect(registryFiles.length).toBeGreaterThan(0);
  });

  it("app 아래 모든 actions.registry.ts가 누수 스캔에 import되어 있다", () => {
    const missing = registryFiles
      .map(importSpecifierFor)
      .filter((spec) => !leakScanSource.includes(`"${spec}"`));
    expect(
      missing,
      `누수 스캔에서 빠진 등록 파일: ${missing.join(", ")}`,
    ).toEqual([]);
  });
});
