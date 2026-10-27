import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 07.1(D-7116 · S7): 저장소의 물리 삭제는 아래 허용 표뿐이다 — 나머지는 보관(archived_at)으로 지운다. 감사 근거가 조용히
// 사라지지 않게, 표 밖 파일에 삭제가 생기거나 개수가 늘면 실패한다. 260907은 DB 트리거였다
// (`O: db/schema/020_functions.sql:230` `block_hard_delete()`) — 트리거 이식은 후속.

const ROOT = path.resolve(__dirname, "../../..");
const REPOSITORIES = path.join(ROOT, "repositories");

// 파일(repositories/ 기준) → 물리 삭제 개수 · 왜 물리 삭제가 맞는지.
const ALLOWED_DELETES: Record<string, { count: number; reason: string }> = {
  "cert-events.ts": { count: 1, reason: "신청 취소 — 토큰 없는 신청됨 행사만(경품 0 확인 뒤), 보관함 규약 예외(N16 a)" },
  "cert-prizes.ts": { count: 1, reason: "경품 표 편집의 줄 삭제 — 버전 확인 뒤 행사 안 편집 행" },
  "cert-submissions.ts": { count: 1, reason: "서명 업로드 의도 표 — FK · 개인정보 없는 임시 의도 행" },
  "expense-evidence-reviews.ts": { count: 1, reason: "증빙 확인 기록 되돌리기 — 증빙 추가 · 무효가 확인 전으로 돌린다(06-11 C4)" },
  "holidays.ts": { count: 2, reason: "대체공휴일 파생 행만 — 규칙이 다시 만든다(수동 행은 보관)" },
  "privacy-session-activity.ts": { count: 1, reason: "better-auth 세션 행 — 로그인 세션은 업무 기록이 아니고 끊긴 세션을 남기지 않는다(활동 행은 CASCADE)" },
  "settings.ts": { count: 1, reason: "아직 적용 전인 미래 이력 값 취소 — 적용된 과거 행은 지우지 않는다" },
  "team-memberships.ts": { count: 1, reason: "미래 발령 취소 — 과거 · 오늘 발령을 지우는 길은 없다" },
};

// drizzle 물리 삭제 호출과 SQL `delete from` — 주석 줄은 뺀다.
const DELETE_PATTERN = /\.delete\(|\bdelete\s+from\b/gi;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return name.endsWith(".ts") ? [full] : [];
  });
}

function countDeletes(source: string): number {
  return source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .reduce((sum, line) => sum + (line.match(DELETE_PATTERN)?.length ?? 0), 0);
}

describe("저장소 물리 삭제 허용 표(07.1 D-7116)", () => {
  it("물리 삭제 자리가 허용 표와 같다 — 표 밖 파일 · 개수 증가는 실패", () => {
    const found: Record<string, number> = {};
    for (const file of sourceFiles(REPOSITORIES)) {
      const count = countDeletes(readFileSync(file, "utf8"));
      if (count > 0) found[path.relative(REPOSITORIES, file)] = count;
    }
    const allowed = Object.fromEntries(Object.entries(ALLOWED_DELETES).map(([file, entry]) => [file, entry.count]));

    expect(found).toEqual(allowed);
  });

  it("허용 표 줄마다 이유가 있다", () => {
    expect(Object.entries(ALLOWED_DELETES).filter(([, entry]) => entry.reason.trim() === "")).toEqual([]);
  });

  it("세는 규칙 — 주석 줄은 빼고 drizzle 삭제와 SQL delete from을 센다", () => {
    expect(countDeletes(["// .delete(old)", "  await tx.delete(rows)", "sql`DELETE FROM t`", " * delete from x"].join("\n"))).toBe(2);
  });
});
