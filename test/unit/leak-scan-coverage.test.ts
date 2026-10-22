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

// 07-03(R1 · K31) — 액션 등록 파일뿐 아니라 `registerDto(`를 부르는 모듈도 누수 스캔이 로드해야 한다.
// 이 시험은 「모듈이 import됐는가」만 본다 — 등록 이름은 읽지 않는다(객체 인자 · 반복문 등록을 정적으로 못 읽음).
// 이름 대조는 통합 시험(leak-scan.test.ts)이 런타임 DTO_REGISTRY로 한다.
const DOMAIN_DIR = resolve(ROOT, "domain");

function findFilesCallingRegisterDto(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findFilesCallingRegisterDto(full));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && entry.name !== "dto-registry.ts") {
      if (readFileSync(full, "utf8").includes("registerDto(")) out.push(full);
    }
  }
  return out;
}

// domain/people/index.ts는 `@/domain/people`로도 import된다 — 폴더 지정자와 index 지정자를 둘 다 받는다.
function importSpecifiersFor(file: string): string[] {
  const spec = importSpecifierFor(file);
  return spec.endsWith("/index") ? [spec, spec.slice(0, -"/index".length)] : [spec];
}

describe("누수 스캔이 registerDto 모듈을 전부 로드한다 (07-03 R1)", () => {
  const dtoFiles = [...findFilesCallingRegisterDto(DOMAIN_DIR), ...findFilesCallingRegisterDto(APP_DIR)];
  const leakScanSource = readFileSync(LEAK_SCAN, "utf8");

  it("registerDto 모듈을 하나 이상 찾았다(검출기 자체가 죽어있지 않다)", () => {
    expect(dtoFiles.length).toBeGreaterThan(0);
  });

  it("registerDto(를 부르는 모든 모듈이 누수 스캔에 import되어 있다", () => {
    const missing = dtoFiles.filter((file) => !importSpecifiersFor(file).some((spec) => leakScanSource.includes(`"${spec}"`)));
    expect(
      missing.map((file) => file.replace(`${ROOT}/`, "")),
      `누수 스캔에서 빠진 registerDto 모듈: ${missing.map((file) => file.replace(`${ROOT}/`, "")).join(", ")}`,
    ).toEqual([]);
  });
});
