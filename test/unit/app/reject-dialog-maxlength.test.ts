import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("next-safe-action/hooks", () => ({ useAction: () => ({ execute: () => undefined }) }));
vi.mock("../../../app/(app)/approvals/actions", () => ({ rejectAction: () => undefined, withdrawAction: () => undefined }));

import { RejectDialog } from "../../../app/(app)/approvals/decision-dialogs";

// 07.2-07 디자인 검토 D1 — 반려 사유 글 칸에 서버 상한(500)이 maxlength로 걸려야 한다(항목 문구 교체가 상한을 넘기지 않게).
describe("RejectDialog — 사유 글 칸 maxlength", () => {
  it("messages.max를 글 칸 maxlength로 건다", () => {
    const html = renderToStaticMarkup(
      createElement(RejectDialog, {
        target: null,
        messages: { empty: "비었음", tooLong: "넘음", max: 500 },
        reasonOptions: ["예산 초과"],
        onClose: () => undefined,
        onDone: () => undefined,
      }),
    );
    expect(html).toMatch(/<textarea[^>]*maxLength="500"/);
  });
});
