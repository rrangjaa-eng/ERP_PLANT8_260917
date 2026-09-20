import { describe, expect, it } from "vitest";
import { project, type DtoSpec } from "@/domain/permissions/project";
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

const viewer: Viewer = { id: "u1", isAdmin: false, roleId: "role-pm" };
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
