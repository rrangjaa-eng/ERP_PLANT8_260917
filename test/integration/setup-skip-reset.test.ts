import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { loginAttempts } from "@/db/schema";
import { skipDbReset } from "./setup";

// setup.ts의 beforeEach TRUNCATE+시드를 건너뛰는 skipDbReset()이 실제로 적용
// 되는지 확인한다. 두 테스트가 한 파일에 있어야 한다: 첫 테스트가 쓴 행이
// 리셋 없이 둘째 테스트까지 남아 있으면 skip이 걸린 것이다(리셋됐다면
// 매 테스트 시작 전 TRUNCATE로 사라진다).
skipDbReset();

describe("setup.ts skipDbReset", () => {
  it("행을 하나 남긴다 (1/2)", async () => {
    await db.insert(loginAttempts).values({ email: "skip-reset-check@example.com", success: true });
  });

  it("리셋 없이 앞 테스트의 행이 남아 있다 (2/2)", async () => {
    const rows = await db.query.loginAttempts.findMany({
      where: (table, { eq }) => eq(table.email, "skip-reset-check@example.com"),
    });
    expect(rows).toHaveLength(1);
  });
});
