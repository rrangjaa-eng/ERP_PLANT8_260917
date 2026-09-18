import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// OPS-07·22A: docs/ARCHITECTURE.md·docs/OPERATIONS.md는 각 300줄 상한(정확히 300은
// 허용, 301은 거부). 두 문서 모두 이후 페이즈가 갱신하므로 초판은 여백을 남긴다.

function readDoc(name: string): string {
  return readFileSync(resolve(process.cwd(), "docs", name), "utf8");
}

function lineCount(content: string): number {
  // 마지막 줄이 개행으로 끝나면 split은 빈 문자열 하나를 더 만든다 — 그건 줄이 아니다.
  const lines = content.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines.length;
}

describe("docs/ARCHITECTURE.md", () => {
  const content = readDoc("ARCHITECTURE.md");

  it("300줄 이하다", () => {
    expect(lineCount(content)).toBeLessThanOrEqual(300);
  });

  it.each([
    "domain/money",
    "domain/rules.gate",
    "project(viewer, dto)",
    "repositories/",
    "authedActionClient",
    "login_attempts",
    "Squawk",
  ])("'%s'를 포함한다", (token) => {
    expect(content).toContain(token);
  });
});

describe("docs/OPERATIONS.md", () => {
  const content = readDoc("OPERATIONS.md");

  it("300줄 이하다", () => {
    expect(lineCount(content)).toBeLessThanOrEqual(300);
  });

  it.each([
    "$30",
    "db-f1-micro",
    "rollback.sh",
    "bootstrap-gcp.sh",
    "ALERT_EMAIL",
    "production",
    "account",
    "SMTP_HOST",
    "GCP_PROJECT_ID",
    "Auth Proxy",
    "dev-db.sh",
    "D-01",
    "2,000",
    "x-client-ip",
    // 01-07 실측으로 "결정적 URL" 가정이 기각됐다 — 런북이 가리켜야 하는 정본은
    // status.url이고, 그것이 문서에 남아 있는지를 대신 고정한다.
    "status.url",
  ])("'%s'를 포함한다", (token) => {
    expect(content).toContain(token);
  });
});

describe("두 문서 모두 실제 GCP 식별자를 담지 않는다(D-03)", () => {
  it("12자리 숫자(프로젝트 번호 형태)가 없다", () => {
    const architecture = readDoc("ARCHITECTURE.md");
    const operations = readDoc("OPERATIONS.md");
    expect(architecture).not.toMatch(/\d{12}/);
    expect(operations).not.toMatch(/\d{12}/);
  });

  it("변수명 GCP_PROJECT_ID는 실제로 존재한다(값이 아니라 이름으로만 쓴다)", () => {
    const operations = readDoc("OPERATIONS.md");
    expect(operations).toContain("GCP_PROJECT_ID");
  });
});
