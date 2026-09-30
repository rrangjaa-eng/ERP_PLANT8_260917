import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  registerDocumentKind,
  getDocumentKind,
  DuplicateDocumentKindError,
  InvalidDocumentKindError,
  UnknownDocumentKindError,
  type DocumentDetailRow,
  type DocumentKindDef,
} from "@/domain/approvals/kinds";
import { loadKindDetails } from "@/domain/approvals";
import type { DtoSpec } from "@/domain/permissions/project";
import type { Viewer } from "@/domain/viewer";

// 결재 모듈은 문서 종류를 하드코딩하지 않는다 — 등록된 종류만 쓴다. 테스트마다 새
// 종류 키를 써서 등록부를 초기화하지 않고도 사례끼리 섞이지 않는다.
function testKind(kind: string): DocumentKindDef {
  return {
    kind,
    label: "테스트 메모",
    loadRouteConfig: () => Promise.resolve({ selfApproval: "skip", steps: [] }),
    href: (id) => `/memo/${id}`,
    describeDocuments: () => Promise.resolve(new Map()),
  };
}

describe("문서 종류 등록부", () => {
  it("등록한 종류를 kind로 되찾는다", () => {
    const kind = `test_memo_${randomUUID()}`;
    const def = testKind(kind);
    registerDocumentKind(def);
    expect(getDocumentKind(kind)).toBe(def);
  });

  it("같은 kind 두 번 등록은 예외", () => {
    const kind = `test_memo_${randomUUID()}`;
    registerDocumentKind(testKind(kind));
    expect(() => registerDocumentKind(testKind(kind))).toThrow(DuplicateDocumentKindError);
  });

  it("등록 안 된 kind는 예외", () => {
    expect(() => getDocumentKind(`nope_${randomUUID()}`)).toThrow(UnknownDocumentKindError);
  });
});

// 04.1-05(Codex MEDIUM · ENG-17 · CX-B2): 종류의 상세 — loadDetails는 구조 필드만 돌려주고, 엔진이
// detailDto로 정보 항목별 project()를 한 뒤 그 결과만 buildDetailRows에 넘긴다. 행 문자열 안에
// 숨긴 정보 항목의 값이 들어갈 경로가 없다.
type TestDetailDto = { title: string; note: string | null; days: number };

const TEST_DETAIL_DTO: DtoSpec<TestDetailDto, TestDetailDto> = {
  fields: [
    { key: "title", from: "title", infoItem: "test.value" },
    { key: "note", from: "note", infoItem: "test.secret" },
    { key: "days", from: "days", infoItem: "test.value" },
  ],
};

function detailKind(kind: string, raw: Record<string, unknown>, seen: { now?: Date | undefined; called: number }): DocumentKindDef {
  return {
    ...testKind(kind),
    loadDetails: (_viewer, ids, deps) => {
      seen.called++;
      seen.now = deps.now;
      return Promise.resolve(new Map(ids.map((id) => [id, raw])));
    },
    detailDto: TEST_DETAIL_DTO,
    buildDetailRows: (projected: Partial<TestDetailDto>) => ({
      title: projected.title ?? "",
      subtitle: "",
      rows: [
        { label: "비고", value: `비고 ${projected.note ?? "—"}`, tone: "default" },
        { label: "일수", value: `${projected.days ?? "—"}일`, tone: "default" },
      ],
    }),
  };
}

const VIEWER = { id: "viewer-1", roleId: "role-pm" } as unknown as Viewer;
const allowAll = () => Promise.resolve(true);
const denySecret = (_viewer: Viewer, item: string) => Promise.resolve(item !== "test.secret");

describe("종류 상세 — detailDto 투영 뒤 buildDetailRows(Codex MEDIUM · ENG-17)", () => {
  it("loadDetails가 명세 밖 키(hireDate)와 옛 모양 행 문자열(rows)을 돌려도 엔진 결과에 없다", async () => {
    const kind = `test_detail_${randomUUID()}`;
    const raw = { title: "제목", note: "메모", days: 3, hireDate: "2026-10-01", rows: [{ label: "새는 행", value: "ROWLEAK-7c1" }] };
    registerDocumentKind(detailKind(kind, raw, { called: 0 }));
    const details = await loadKindDetails(VIEWER, kind, ["d1"], { visible: allowAll });
    const json = JSON.stringify([...details.values()]);
    expect(details.get("d1")?.title).toBe("제목");
    expect(json).not.toContain("2026-10-01");
    expect(json).not.toContain("ROWLEAK-7c1");
  });

  it("숨긴 정보 항목(test.secret)의 값은 어느 행 문자열에도 없고 보이는 값(days)은 있다", async () => {
    const kind = `test_detail_${randomUUID()}`;
    registerDocumentKind(detailKind(kind, { title: "제목", note: "SECRET-NOTE-9f3", days: 7 }, { called: 0 }));
    const hidden = await loadKindDetails(VIEWER, kind, ["d1"], { visible: denySecret });
    const detail = hidden.get("d1");
    expect(JSON.stringify(detail)).not.toContain("SECRET-NOTE-9f3");
    expect(detail?.rows.map((row) => row.value)).toContain("7일");

    // 검출기 사례 — 전부 허용하면 같은 값이 행에 나타난다(공허한 통과 방지).
    const shown = await loadKindDetails(VIEWER, kind, ["d1"], { visible: allowAll });
    expect(shown.get("d1")?.rows.map((row) => row.value)).toContain("비고 SECRET-NOTE-9f3");
  });

  it("행은 label · value · tone 문자열 칸만 싣는다", async () => {
    const kind = `test_detail_${randomUUID()}`;
    const def = detailKind(kind, { title: "제목", note: null, days: 1 }, { called: 0 });
    registerDocumentKind({
      ...def,
      buildDetailRows: () => ({
        title: "제목",
        subtitle: "부제",
        rows: [{ label: "라벨", value: "값", tone: "muted", extra: "ROWLEAK-extra" } as DocumentDetailRow],
      }),
    });
    const details = await loadKindDetails(VIEWER, kind, ["d1"], { visible: allowAll });
    expect(details.get("d1")?.rows).toEqual([{ label: "라벨", value: "값", tone: "muted" }]);
  });

  it("loadDetails가 있는데 detailDto 또는 buildDetailRows가 없으면 등록에서 예외, loadDetails가 없으면 그대로 등록된다", () => {
    const seen = { called: 0 };
    const withoutDto = { ...detailKind(`test_detail_${randomUUID()}`, {}, seen), detailDto: undefined };
    const withoutRows = { ...detailKind(`test_detail_${randomUUID()}`, {}, seen), buildDetailRows: undefined };
    expect(() => registerDocumentKind(withoutDto)).toThrow(InvalidDocumentKindError);
    expect(() => registerDocumentKind(withoutRows)).toThrow(InvalidDocumentKindError);
    expect(() => registerDocumentKind(testKind(`test_memo_${randomUUID()}`))).not.toThrow();
  });

  it("주입한 now가 loadDetails의 deps.now로 그대로 가고, 없으면 undefined다(CX-B2 — 엔진이 시계를 읽지 않는다)", async () => {
    const kind = `test_detail_${randomUUID()}`;
    const seen: { now?: Date | undefined; called: number } = { called: 0 };
    registerDocumentKind(detailKind(kind, { title: "t", note: null, days: 1 }, seen));
    const now = new Date("2031-01-02T00:00:00Z");
    await loadKindDetails(VIEWER, kind, ["a", "b"], { visible: allowAll, now });
    expect(seen.called).toBe(1);
    expect(seen.now?.getTime()).toBe(now.getTime());
    await loadKindDetails(VIEWER, kind, ["a"], { visible: allowAll });
    expect(seen.now).toBeUndefined();
  });
});
