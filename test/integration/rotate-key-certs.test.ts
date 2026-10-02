import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { certEvents, certSubmissions } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { setSettingValue } from "@/domain/settings/registry";
import { CERT_ENABLED } from "@/domain/settings/keys";
import { encrypt } from "@/lib/crypto";
import { TARGETS } from "@/scripts/rotate-key";
import { seedSubmittedCert } from "@/test/e2e/helpers/cert";

// 04.3-08 Task 1 ⑥-d(codex #10) — 회전 대상에 확인증 주민등록번호 · QR 토큰 암호문이
// 있다. 확인증은 domain 흐름(seedSubmittedCert — 규약 C4)으로 만든다. 새 대상의
// writeRow는 읽은 값(previous)과 지금 값이 같을 때만 쓴다 — 읽은 뒤 정정(04.3-07)이
// 먼저 쓴 값을 옛 값의 재암호문으로 덮지 않는다.

beforeEach(async () => {
  await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, true);
});

function target(label: string) {
  const found = TARGETS.find((t) => t.label === label);
  if (!found) throw new Error(`회전 대상 없음: ${label}`);
  return found;
}

describe("rotate-key 확인증 대상(04.3-08)", () => {
  it("cert_submissions.rrn_encrypted — fetchRows가 제출 행을 돌려주고 writeRow는 previous가 같을 때만 쓴다", async () => {
    await seedSubmittedCert({ rrn: "9304122123458" });
    const [row] = await db.select().from(certSubmissions);
    const current = row?.rrnEncrypted;
    if (!row || !current) throw new Error("제출 행이 없다");
    const rrn = target("cert_submissions.rrn_encrypted");

    const fetched = await rrn.fetchRows();
    expect(fetched).toContainEqual({ id: row.id, value: current });

    // 읽은 뒤 정정이 먼저 쓴 상황: 옛 값(stale)을 previous로 넘기면 아무것도 안 바뀐다.
    const corrected = encrypt("9304122999999");
    await db.update(certSubmissions).set({ rrnEncrypted: corrected }).where(eq(certSubmissions.id, row.id));
    expect(await rrn.writeRow(row.id, encrypt("9304122123458"), current)).toBe(0);
    const [afterStale] = await db.select().from(certSubmissions).where(eq(certSubmissions.id, row.id));
    expect(afterStale?.rrnEncrypted).toBe(corrected);

    // previous가 지금 값과 같으면 쓴다.
    const rotated = encrypt("9304122999999");
    expect(await rrn.writeRow(row.id, rotated, corrected)).toBe(1);
    const [afterWrite] = await db.select().from(certSubmissions).where(eq(certSubmissions.id, row.id));
    expect(afterWrite?.rrnEncrypted).toBe(rotated);
  });

  it("cert_events.token_encrypted — fetchRows가 행사 행을 돌려주고 writeRow는 previous가 같을 때만 쓴다", async () => {
    await seedSubmittedCert();
    const [event] = await db.select().from(certEvents);
    if (!event?.tokenEncrypted) throw new Error("토큰이 있는 행사 행이 없다");
    const token = target("cert_events.token_encrypted");

    const fetched = await token.fetchRows();
    expect(fetched).toContainEqual({ id: event.id, value: event.tokenEncrypted });

    const replaced = encrypt("다른 토큰");
    await db.update(certEvents).set({ tokenEncrypted: replaced }).where(eq(certEvents.id, event.id));
    expect(await token.writeRow(event.id, encrypt("옛 토큰 재암호문"), event.tokenEncrypted)).toBe(0);
    const [afterStale] = await db.select().from(certEvents).where(eq(certEvents.id, event.id));
    expect(afterStale?.tokenEncrypted).toBe(replaced);

    const rotated = encrypt("다른 토큰");
    expect(await token.writeRow(event.id, rotated, replaced)).toBe(1);
    const [afterWrite] = await db.select().from(certEvents).where(eq(certEvents.id, event.id));
    expect(afterWrite?.tokenEncrypted).toBe(rotated);
  });
});
