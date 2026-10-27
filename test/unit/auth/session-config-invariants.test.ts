import { describe, expect, it, vi } from "vitest";
import type { BetterAuthOptions } from "better-auth";

// PR #307 검토 P2: 퇴사 · 보관 세션 판정(domain/auth/hooks.ts before)은 세션을 DB에서 읽는다는 전제 위에 서 있다.
// cookieCache를 켜면 판정 읽기가 서명된 쿠키 사본을 믿어 보관 · 퇴사 값이 최대 maxAge만큼 낡고, 세션을 만들거나
// 바꾸는 플러그인(multi-session · admin 대리 로그인 등)은 판정이 모르는 세션 경로를 더한다. 둘 중 하나가 바뀌면
// 이 시험이 먼저 깨져 판정을 다시 보게 한다.
vi.mock("@/db/client", () => {
  const fake = new Proxy(
    {},
    {
      get: () => () => {
        throw new Error("DB에 닿았다");
      },
    },
  );
  return { db: fake, pool: fake, closeDb: () => Promise.resolve() };
});

const { auth } = await import("@/lib/auth");
// 리터럴 설정 타입에는 쓰지 않은 키가 없다 — 넓은 옵션 타입으로 읽어 「없음」을 잰다.
const options: BetterAuthOptions = auth.options;

describe("auth 설정 불변식 — 퇴사 · 보관 세션 판정의 전제", () => {
  it("session.cookieCache를 쓰지 않는다(없음 또는 꺼짐)", () => {
    expect(options.session?.cookieCache?.enabled ?? false).toBe(false);
  });

  it("플러그인이 없다 — 더하려면 그 플러그인이 세션을 만들거나 바꾸는지 보고 hooks.ts 판정을 다시 확인한다", () => {
    expect((options.plugins ?? []).map((p) => p.id)).toEqual([]);
  });
});
