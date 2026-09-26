import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// docs/design/SYSTEM.md §8 규칙 3 · DECISIONS.md 2026-09-26 「오류 문구 명사형 통일」 —
// 사용자에게 보이는 오류 문구(검증 오류·행동 실패)는 짧은 명사형, 마침표 없음, 높임말 종결 금지.
// 오류 문구가 태어나는 자리(zod 메시지 인자, addIssue message, 오류 클래스 생성자, 필드 거부 reason,
// 폼 실패 요약)를 소스에서 훑어 한 곳이라도 남으면 실패한다.
// 제외(사용자 결정): 설정 힌트, 「날짜를 골라 주세요」, 빈 목록 문구, 성공·되돌리기 토스트.
// 범위 밖(개발자 전용): 설정 레지스트리·내보내기, 암호화, 저장소 계층, GCP, 문서 번호 서식, 운영 환경변수 규칙.

const ROOT = path.resolve(__dirname, "../..");
const SCAN_DIRS = ["app", "domain", "lib", "ui"];
const DEVELOPER_ONLY = [
  "domain/settings/registry.ts",
  "domain/settings/export.ts",
  "domain/settings/keys.ts",
  "domain/document-numbering/",
  "domain/ops/pool-rule.ts",
  "lib/crypto.ts",
  "lib/gcp/",
  "repositories/",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

// 오류 문구가 태어나는 자리 — 문자열 인자를 잡는다.
const ERROR_SITES: RegExp[] = [
  /\.(?:min|max|regex|email|length|refine)\([^"`\n]*?["`]([^"`\n]*[가-힣][^"`\n]*)["`]/g,
  /\bmessage:\s*["`]([^"`\n]*[가-힣][^"`\n]*)["`]/g,
  /new (\w*Error)\(\s*(?:"[a-z]+",\s*)?["`]([^"`\n]*[가-힣][^"`\n]*)["`]/g,
  /\breason:\s*["`]([^"`\n]*[가-힣][^"`\n]*)["`]/g,
  /\breturn\s+["`]([^"`\n]*[가-힣][^"`\n]*)["`]/g,
  /=\s*["`]([^"`\n]*(?:오류|실패)[^"`\n]*)["`]/g,
  /`(오류 \$\{[^`\n]*)`/g,
];
// 폼·행동 실패 요약 「~하지 못했습니다」는 어디에 있든 오류다.
const FAILURE_SENTENCE = /["`>]([^"`<\n]*지 못했습니다[^"`<\n]*)["`<]/g;

// 끝이든 「원인 · 다음 행동」의 원인 자리(가운뎃점·쌍점 앞)든 높임말 종결이면 걸린다.
const HONORIFIC_OR_PERIOD = /(?:습니다|세요|입니다|니다)\.?(?:$|\s*[·:])|\.$/;
const EXEMPT = new Set(["날짜를 골라 주세요"]);
// 등록부·규칙 불변식 위반 — 코드 결함일 때만 나는 일반 Error라 화면에 나가지 않는다(handleServerError allowlist).
const DEVELOPER_ERRORS = new Set([
  "DuplicateDtoError",
  "EmptyInfoItemsError",
  "UnknownGateRuleError",
  "DuplicateActionError",
  "DuplicateExportError",
]);

function stripComments(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");
}

function offenders(): string[] {
  const found: string[] = [];
  for (const dir of SCAN_DIRS) {
    for (const file of sourceFiles(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      if (DEVELOPER_ONLY.some((prefix) => rel.startsWith(prefix) || rel.includes(`/${prefix}`))) continue;
      const text = stripComments(readFileSync(file, "utf8"));
      for (const pattern of ERROR_SITES) {
        for (const match of text.matchAll(pattern)) {
          // 오류 클래스 자리만 두 그룹(클래스 · 문구)이다 — 문구는 늘 마지막 그룹.
          const copy = (match[match.length - 1] ?? "").trim();
          const errorClass = match.length > 2 ? (match[1] ?? "") : "";
          if (EXEMPT.has(copy) || DEVELOPER_ERRORS.has(errorClass)) continue;
          if (HONORIFIC_OR_PERIOD.test(copy)) found.push(`${rel}: ${copy}`);
        }
      }
      for (const match of text.matchAll(FAILURE_SENTENCE)) found.push(`${rel}: ${(match[1] ?? "").trim()}`);
    }
  }
  return [...new Set(found)].sort();
}

describe("오류 문구 명사형 통일 (결정 4 · SYSTEM.md §8-3)", () => {
  it("사용자에게 보이는 오류 문구에 높임말 종결·마침표·「~하지 못했습니다」가 없다", () => {
    expect(offenders()).toEqual([]);
  });
});
