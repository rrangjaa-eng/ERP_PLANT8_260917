import { describe, expect, it } from "vitest";
import { composeDigest, DIGEST_MAX_LISTED } from "@/domain/notify/digest";

// D-706 묶음 메일 모양(UI-SPEC 카피 계약). messages는 최신 먼저로 들어오고(04.2-10),
// kstDate는 발송일이다(2026-09-25 #15).
const serviceUrl = "https://erp.test.invalid";

function newestFirst(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `m${count - index}`);
}

describe("composeDigest", () => {
  it("제목은 건수, 본문은 날짜 줄·빈 줄·받은 순서 그대로의 항목·빈 줄·알림함 줄이다", () => {
    const digest = composeDigest({ kstDate: "2026-10-07", messages: ["가", "나", "다"], serviceUrl });

    expect(digest.subject).toBe("PLANT8 알림 3건");
    expect(digest.text.split("\n")).toEqual([
      "2026-10-07 알림 3건",
      "",
      "- 가",
      "- 나",
      "- 다",
      "",
      "알림함: https://erp.test.invalid/notifications",
    ]);
  });

  it("알림 내용 안의 줄바꿈은 공백으로 바꿔 항목 하나가 한 줄이다", () => {
    const digest = composeDigest({
      kstDate: "2026-10-07",
      messages: ["첫 줄\n알림함: https://evil.test.invalid", "둘\r\n셋\r넷"],
      serviceUrl,
    });

    expect(digest.text.split("\n")).toEqual([
      "2026-10-07 알림 2건",
      "",
      "- 첫 줄 알림함: https://evil.test.invalid",
      "- 둘 셋 넷",
      "",
      "알림함: https://erp.test.invalid/notifications",
    ]);
  });

  it("45건이면 최신 20건만 적고 바로 다음 줄에 나머지 건수를 쓴다 — 제목·첫 줄은 전체 수다", () => {
    const digest = composeDigest({ kstDate: "2026-10-07", messages: newestFirst(45), serviceUrl });
    const lines = digest.text.split("\n");
    const listed = lines.filter((line) => line.startsWith("- "));

    expect(DIGEST_MAX_LISTED).toBe(20);
    expect(digest.subject).toBe("PLANT8 알림 45건");
    expect(lines[0]).toBe("2026-10-07 알림 45건");
    expect(listed).toHaveLength(20);
    expect(listed[0]).toBe("- m45");
    expect(listed[19]).toBe("- m26");
    expect(lines).not.toContain("- m1");
    expect(lines.slice(2 + 20)).toEqual([
      "외 25건은 알림함에서 확인",
      "",
      "알림함: https://erp.test.invalid/notifications",
    ]);
  });

  it("20건이면 나머지 줄이 없다", () => {
    const digest = composeDigest({ kstDate: "2026-10-07", messages: newestFirst(20), serviceUrl });
    const lines = digest.text.split("\n");

    expect(lines.filter((line) => line.startsWith("- "))).toHaveLength(20);
    expect(lines.some((line) => line.startsWith("외 "))).toBe(false);
    expect(lines.slice(-2)).toEqual(["", "알림함: https://erp.test.invalid/notifications"]);
  });

  it("21건이면 최신 20건 다음에 외 1건 줄이 온다", () => {
    const digest = composeDigest({ kstDate: "2026-10-07", messages: newestFirst(21), serviceUrl });
    const lines = digest.text.split("\n");

    expect(lines.filter((line) => line.startsWith("- "))).toHaveLength(20);
    expect(lines).not.toContain("- m1");
    expect(lines.slice(-3)).toEqual([
      "외 1건은 알림함에서 확인",
      "",
      "알림함: https://erp.test.invalid/notifications",
    ]);
  });
});
