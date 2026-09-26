import { describe, expect, it } from "vitest";
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
