import type { Project } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { afterEach, vi } from "vitest";
import config from "../../../playwright.config";

// 코디네이터 지시(PR #88) — Task 1 커밋 7d726e3(규약 C4 Playwright 프로젝트
// 격리)가 test/unit/deploy/deploy-sh.test.ts와 달리 구조 자체를 단언하는
// 커밋된 테스트가 없었다(계획의 <verify> ad-hoc grep·--list뿐). 이 파일이
// 그 빈자리를 메운다 — 실행자가 아닌 회귀 테스트로 프로젝트 구조를 고정한다.
describe("playwright.config.ts — 규약 C4 확인증 프로젝트 격리(백필)", () => {
  const projects = config.projects ?? [];
  const byName = (name: string) => projects.find((p) => p.name === name);

  it("desktop은 mobile·cert 스펙 패턴 둘 다 무시한다", () => {
    const desktop = byName("desktop");
    expect(desktop?.testIgnore).toEqual(expect.arrayContaining([expect.stringContaining("mobile"), "*cert*.spec.ts"]));
  });

  it("mobile-375는 cert 스펙 패턴을 무시한다", () => {
    const mobile = byName("mobile-375");
    expect(mobile?.testIgnore).toBe("*cert*.spec.ts");
  });

  it("cert-setup은 cert.setup.ts만 잡고 desktop·mobile-375에 의존한다", () => {
    const certSetup = byName("cert-setup");
    expect(certSetup?.testMatch).toBe("cert.setup.ts");
    expect(certSetup?.dependencies).toEqual(["desktop", "mobile-375"]);
  });

  it("certs는 *cert*.spec.ts만 잡고 워커 1 · cert-setup에 의존한다", () => {
    const certs = byName("certs");
    expect(certs?.testMatch).toBe("*cert*.spec.ts");
    expect(certs?.workers).toBe(1);
    expect(certs?.dependencies).toEqual(["cert-setup"]);
  });

  it("globalSetup이 통합 테스트처럼 CERT_FEATURE_ALLOWED를 켠다(webServer가 물려받는다)", () => {
    expect(process.env.CERT_FEATURE_ALLOWED).toBe("true");
  });
});

// 04.6-13(Q13) — `visual` 프로젝트. 위 #88 단언은 한 줄도 바꾸지 않고 아래에 더한다.
// CI·E2E_SKIP_DESKTOP 조합마다 설정을 새로 불러온다(`desktop.dependencies`가 import 시점의 환경 변수로 갈린다).
async function loadProjects(env: { CI: string; E2E_SKIP_DESKTOP: string }): Promise<Project[]> {
  vi.resetModules();
  vi.stubEnv("CI", env.CI);
  vi.stubEnv("E2E_SKIP_DESKTOP", env.E2E_SKIP_DESKTOP);
  const loaded = (await import("../../../playwright.config")).default;
  return loaded.projects ?? [];
}

function matchesPattern(pattern: Project["testMatch"], file: string): boolean {
  const patterns = Array.isArray(pattern) ? pattern : [pattern];
  return patterns.some((entry) => entry instanceof RegExp && entry.test(file));
}

describe("playwright.config.ts — 04.6-13 visual 프로젝트(Q13 · R2 · #150)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("visual은 워커 1이고 자신의 dependencies가 없다", async () => {
    const visual = (await loadProjects({ CI: "", E2E_SKIP_DESKTOP: "" })).find((p) => p.name === "visual");
    expect(visual).toBeDefined();
    expect(visual?.workers).toBe(1);
    expect(visual?.dependencies).toBeUndefined();
  });

  it("visual testMatch는 visual.spec.ts · visual-390.spec.ts만 잡고 mobile- 이름은 잡지 않는다", async () => {
    const visual = (await loadProjects({ CI: "", E2E_SKIP_DESKTOP: "" })).find((p) => p.name === "visual");
    expect(matchesPattern(visual?.testMatch, "/repo/test/e2e/visual.spec.ts")).toBe(true);
    expect(matchesPattern(visual?.testMatch, "/repo/test/e2e/visual-390.spec.ts")).toBe(true);
    expect(matchesPattern(visual?.testMatch, "/repo/test/e2e/mobile-visual.spec.ts")).toBe(false);
    expect(matchesPattern(visual?.testMatch, "/repo/test/e2e/a11y.spec.ts")).toBe(false);
  });

  it("desktop.testIgnore가 시각 스펙 패턴을 담고 mobile-375 · certs · cert-setup의 testIgnore는 시각 패턴을 담지 않는다", async () => {
    const projects = await loadProjects({ CI: "", E2E_SKIP_DESKTOP: "" });
    const byName = (name: string) => projects.find((p) => p.name === name);
    expect(byName("desktop")?.testIgnore).toEqual(expect.arrayContaining(["visual.spec.ts", "visual-390.spec.ts"]));
    expect(byName("mobile-375")?.testIgnore).toBe("*cert*.spec.ts");
    expect(byName("certs")?.testIgnore).toBeUndefined();
    expect(byName("cert-setup")?.testIgnore).toBeUndefined();
  });

  it("desktop.dependencies — CI가 없으면 비어 있다(로컬 --list에 visual이 끌려오지 않는다)", async () => {
    const desktop = (await loadProjects({ CI: "", E2E_SKIP_DESKTOP: "" })).find((p) => p.name === "desktop");
    expect(desktop?.dependencies ?? []).toEqual([]);
  });

  it("desktop.dependencies — CI면 visual 하나다", async () => {
    const desktop = (await loadProjects({ CI: "true", E2E_SKIP_DESKTOP: "" })).find((p) => p.name === "desktop");
    expect(desktop?.dependencies).toEqual(["visual"]);
  });

  it("desktop.dependencies — CI와 E2E_SKIP_DESKTOP이 함께 있으면(2번 샤드 폰·설정 단계) 비어 있다", async () => {
    const desktop = (await loadProjects({ CI: "true", E2E_SKIP_DESKTOP: "1" })).find((p) => p.name === "desktop");
    expect(desktop?.dependencies ?? []).toEqual([]);
  });

  it("다른 프로젝트의 dependencies에는 visual을 더하지 않는다", async () => {
    const projects = await loadProjects({ CI: "true", E2E_SKIP_DESKTOP: "" });
    for (const project of projects.filter((p) => p.name !== "desktop")) {
      expect(project.dependencies ?? []).not.toContain("visual");
    }
  });
});
