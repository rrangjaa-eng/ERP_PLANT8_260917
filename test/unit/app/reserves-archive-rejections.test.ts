import { describe, expect, it, vi } from "vitest";
// 표 모듈이 서버 액션을 거쳐 server-only를 import한다 — 순수 판정 함수만 보므로 그 표식은 비운다.
vi.mock("server-only", () => ({}));

import { splitAlreadyArchived } from "@/app/(app)/pnl/reserves/reserves-table";
import { RESERVE_ARCHIVED_ROW_REASON } from "@/domain/reserves/save-contract";

// Opus 독립 검토 후속(Codex #3) — 화면은 alreadyArchived의 id만 보관 큐에서 빼므로, 목표를 못 이룬 같은 field row 거부(중복 · 없는 줄)는 여기 들어오면 안 된다.
// domain/reserves/index.ts의 DUPLICATE_ROW · ENTRY_NOT_FOUND와 글자 같다(서버 모듈은 db를 끌고 와 import하지 않는다).
const DUPLICATE_ROW = "같은 줄 중복 · 새로 고침";
const ENTRY_NOT_FOUND = "줄을 찾을 수 없음 · 새로 고침";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const E = "00000000-0000-4000-8000-00000000000e";
const N = "00000000-0000-4000-8000-00000000000f";

describe("splitAlreadyArchived — 보관 거부 판정", () => {
  it("(Codex #3 후속) 보낸 보관 id의 field row · 보관된 줄 이유 거부는 이미 이룬 보관으로 가른다", () => {
    const cells = [{ rowId: A, field: "row", reason: RESERVE_ARCHIVED_ROW_REASON }];

    expect(splitAlreadyArchived(cells, [A])).toEqual({ alreadyArchived: [A], remaining: [] });
  });

  it("(Codex #3 후속) 같은 field row라도 중복 · 없는 줄 거부는 보관 큐에 남고 남은 칸으로 남는다", () => {
    const cells = [
      { rowId: A, field: "row", reason: DUPLICATE_ROW },
      { rowId: B, field: "row", reason: ENTRY_NOT_FOUND },
    ];

    expect(splitAlreadyArchived(cells, [A, B])).toEqual({ alreadyArchived: [], remaining: cells });
  });

  it("(Codex #3 후속) 보내지 않은 id의 보관된 줄 거부는 가르지 않고 남긴다", () => {
    const cells = [{ rowId: E, field: "row", reason: RESERVE_ARCHIVED_ROW_REASON }];

    expect(splitAlreadyArchived(cells, [A])).toEqual({ alreadyArchived: [], remaining: cells });
  });

  it("(Codex #3 후속) 보낸 보관 id라도 field가 row가 아니면 가르지 않고 남긴다", () => {
    const cells = [{ rowId: A, field: "entryDate", reason: RESERVE_ARCHIVED_ROW_REASON }];

    expect(splitAlreadyArchived(cells, [A])).toEqual({ alreadyArchived: [], remaining: cells });
  });

  it("(Codex #3 후속) 섞인 거부에서 보관된 줄만 가르고 나머지는 순서 그대로 남긴다", () => {
    const mismatch = { rowId: N, field: "projectId", reason: "다른 클라이언트의 프로젝트 · 프로젝트 다시 고르기" };
    const orphan = { rowId: undefined, field: "row", reason: DUPLICATE_ROW };
    const cells = [{ rowId: A, field: "row", reason: RESERVE_ARCHIVED_ROW_REASON }, mismatch, orphan];

    expect(splitAlreadyArchived(cells, [A])).toEqual({ alreadyArchived: [A], remaining: [mismatch, orphan] });
  });
});
