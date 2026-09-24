import { describe, expect, it } from "vitest";
import { project, projectMany, type DtoSpec } from "@/domain/permissions/project";
import type { Viewer } from "@/domain/viewer";

type Dto = { id: string; value: string; label: string };
type WideRow = Dto & { secret: string };

const spec: DtoSpec<Dto, Dto> = {
  fields: [
    { key: "id", from: "id", infoItem: "item.id" },
    { key: "value", from: "value", infoItem: "item.value" },
    { key: "label", from: "label", infoItem: "item.label" },
  ],
};

const viewer: Viewer = { id: "u1", roleId: "role-pm" };
const row: WideRow = { id: "r1", value: "v1", label: "l1", secret: "s1" };

function visibleAll() {
  return Promise.resolve(true);
}

describe("project (domain의 유일한 출구)", () => {
  it("spec 밖의 키(secret)는 결과에 없다", async () => {
    const dto = await project(viewer, row, spec, { visible: visibleAll });
    expect(dto).not.toHaveProperty("secret");
  });

  it("spec에 있지만 노출 판정이 false인 키는 제거된다", async () => {
    const dto = await project(viewer, row, spec, {
      visible: (_v, infoItem) => Promise.resolve(infoItem !== "item.label"),
    });
    expect(dto).not.toHaveProperty("label");
    expect(dto.value).toBe("v1");
  });

  it("결과 키 순서가 spec 선언 순서와 같다 — 노출표 행 순서와 무관", async () => {
    const dto = await project(viewer, row, spec, { visible: visibleAll });
    expect(Object.keys(dto)).toEqual(["id", "value", "label"]);
  });

  it("이미 투영된 결과를 같은 spec으로 다시 투영해도 첫 결과와 깊은 비교로 같다(멱등)", async () => {
    const first = await project(viewer, row, spec, { visible: visibleAll });
    // 모든 spec.fields가 visible=true라 first는 실제로 Dto 전체 필드를 갖는다
    // (반환 타입 Partial<Dto>는 프로젝션이 부분 결과일 수 있다는 보수적 타입일
    // 뿐 — project()를 다시 호출하는 실제 호출자는 항상 구체적인 값을 다룬다).
    const second = await project(viewer, first as Dto, spec, { visible: visibleAll });
    expect(second).toEqual(first);
  });
});

// Phase 4(04-32, ENG-D3 ②) — 호출당 정보 항목 한 번 조회 · projectMany · all-of.
describe("project·projectMany — 호출당 정보 항목 한 번(ENG-D3 ②)", () => {
  function makeCountingVisible(ok: boolean | ((infoItem: string) => boolean) = true) {
    const calls: string[] = [];
    const fn = (_v: Viewer, infoItem: string) => {
      calls.push(infoItem);
      return Promise.resolve(typeof ok === "function" ? ok(infoItem) : ok);
    };
    return { fn, calls };
  }

  it("16필드가 전부 같은 정보 항목(quote.amount)이면 노출 스텁이 1번만 불린다", async () => {
    const fields = Array.from({ length: 16 }, (_, i) => ({
      key: `f${i}`,
      from: `f${i}`,
      infoItem: "quote.amount",
    }));
    const wideSpec: DtoSpec<Record<string, number>, Record<string, number>> = { fields };
    const wideRow = Object.fromEntries(fields.map((f, i) => [f.from, i]));
    const { fn, calls } = makeCountingVisible();

    await project(viewer, wideRow, wideSpec, { visible: fn });

    expect(calls.length).toBe(1);
  });

  it("필드 셋이 서로 다른 정보 항목 둘을 쓰면 노출 스텁이 2번 불린다", async () => {
    const twoItemSpec: DtoSpec<{ a: number; b: number }, { a: number; b: number }> = {
      fields: [
        { key: "a", from: "a", infoItem: "quote.amount" },
        { key: "b", from: "b", infoItem: "revenue.issued_amount" },
      ],
    };
    const { fn, calls } = makeCountingVisible();

    await project(viewer, { a: 1, b: 2 }, twoItemSpec, { visible: fn });

    expect(calls.length).toBe(2);
  });

  it("projectMany(300행 × 18필드, 서로 다른 항목 2)는 스텁을 2번만 부르고 결과가 project()를 행마다 부른 것과 같다", async () => {
    const fields = Array.from({ length: 18 }, (_, i) => ({
      key: `f${i}`,
      from: `f${i}`,
      infoItem: i % 2 === 0 ? "quote.amount" : "revenue.issued_amount",
    }));
    const manySpec: DtoSpec<Record<string, number>, Record<string, number>> = { fields };
    const rows = Array.from({ length: 300 }, (_, r) =>
      Object.fromEntries(fields.map((f, i) => [f.from, r * 100 + i])),
    );

    const { fn: countingFn, calls } = makeCountingVisible();
    const manyResult = await projectMany(viewer, rows, manySpec, { visible: countingFn });

    expect(calls.length).toBe(2);
    expect(manyResult).toHaveLength(300);

    const alwaysTrue = () => Promise.resolve(true);
    const viaProjectMany = await projectMany(viewer, rows, manySpec, { visible: alwaysTrue });
    const viaProjectPerRow = await Promise.all(
      rows.map((r) => project(viewer, r, manySpec, { visible: alwaysTrue })),
    );
    expect(viaProjectMany).toEqual(viaProjectPerRow);
  });

  it("all-of 필드는 목록의 모든 항목이 참일 때만 키가 실린다", async () => {
    const allOfSpec: DtoSpec<{ profitKrw: number }, { profitKrw: number }> = {
      fields: [{ key: "profitKrw", from: "profitKrw", infoItem: ["quote.amount", "revenue.issued_amount"] }],
    };
    const allOfRow = { profitKrw: 1000 };

    const bothTrue = await project(viewer, allOfRow, allOfSpec, { visible: () => Promise.resolve(true) });
    expect(bothTrue).toHaveProperty("profitKrw");

    const oneFalse = await project(viewer, allOfRow, allOfSpec, {
      visible: (_v, item) => Promise.resolve(item !== "revenue.issued_amount"),
    });
    expect(oneFalse).not.toHaveProperty("profitKrw");

    const bothFalse = await project(viewer, allOfRow, allOfSpec, { visible: () => Promise.resolve(false) });
    expect(bothFalse).not.toHaveProperty("profitKrw");
  });
});
