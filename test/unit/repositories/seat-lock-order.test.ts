import { describe, expect, it } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { CEO_ROLE_ID } from "@/domain/permissions/roles";
import type { DbOrTx } from "@/db/client";
import { lockSeatKeys, seatLockOrder } from "@/repositories/seats";

// 06.4(D-6408): 자리 잠금 키 순서 — 층(사람 → 관리자 → 팀 → 본부) 고정, 같은 층은 중복 제거 후 정렬. DB 없이 순서만 고정한다.
describe("seatLockOrder", () => {
  it("층 순서 사람 → 관리자 → 팀 → 본부, 같은 층은 정렬 · 중복 제거", () => {
    expect(seatLockOrder(SYSTEM_VIEWER, { teamIds: ["t2", "t1"], personIds: ["p2", "p1", "p2"], admin: true, orgUnitIds: ["o1"] })).toEqual([
      "seat:person:p1",
      "seat:person:p2",
      "seat:admin:last",
      "seat:team:t1",
      "seat:team:t2",
      "seat:division:o1",
    ]);
  });

  it("빈 입력은 빈 배열", () => {
    expect(seatLockOrder(SYSTEM_VIEWER, {})).toEqual([]);
  });

  it("admin이 거짓이면 관리자 키 없음", () => {
    expect(seatLockOrder(SYSTEM_VIEWER, { admin: false, teamIds: ["t1"] })).toEqual(["seat:team:t1"]);
  });

  // 07.1(D-7128 · E-P2-21): 회사 자리 키는 관리자 키 뒤 · 팀 층 앞.
  it("회사 층은 관리자 키 뒤 · 팀 층 앞, 같은 층은 정렬", () => {
    expect(
      seatLockOrder(SYSTEM_VIEWER, { personIds: ["p1"], admin: true, companyRoleIds: ["role-sysadmin", "role-ceo"], teamIds: ["t1"], orgUnitIds: ["o1"] }),
    ).toEqual(["seat:person:p1", "seat:admin:last", "seat:company:role-ceo", "seat:company:role-sysadmin", "seat:team:t1", "seat:division:o1"]);
  });
});

// 07.1(E-P2-21): 사람 키가 있는 첫 호출도 회사 키를 잡는다 — 팀 · 본부 키(두 번째 호출) 뒤에 잡으면 순서가 뒤집힌다.
describe("lockSeatKeys — 사람 갈래 첫 호출의 회사 키", () => {
  it("사람 · 관리자 · 회사 키를 차례로 잡는다", async () => {
    const dialect = new PgDialect();
    const keys: unknown[] = [];
    const empty = Promise.resolve([]);
    const tx = {
      execute: (query: SQL) => {
        keys.push(...dialect.sqlToQuery(query).params);
        return Promise.resolve({ rows: [] });
      },
      select: () => ({ from: () => ({ where: () => empty }) }),
    } as unknown as DbOrTx;

    await lockSeatKeys(SYSTEM_VIEWER, { personIds: ["p1"], admin: true, companyRoleIds: [CEO_ROLE_ID] }, tx);

    expect(keys).toEqual(["seat:person:p1", "seat:admin:last", `seat:company:${CEO_ROLE_ID}`]);
  });
});
