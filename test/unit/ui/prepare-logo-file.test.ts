import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prepareLogoFile } from "../../../ui/attachments/prepare-file";

// 07.2-10 /review P2 — 회사 로고는 증빙처럼 JPEG로 다시 줄이지 않는다: 원본 형식 · 이름 · 바이트 그대로 올리고 2MB 검사는 실제 파일 크기에 걸린다.
const PNG_HEAD = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("prepareLogoFile — 원본 그대로", () => {
  it("PNG는 PNG로 남고 이름 · 크기 · SHA-256이 원본 바이트와 같다", async () => {
    const bytes = new Uint8Array([...PNG_HEAD, 1, 2, 3, 4, 5]);
    const prepared = await prepareLogoFile(new File([bytes], "회사로고.png", { type: "image/png" }));
    expect(prepared.contentType).toBe("image/png");
    expect(prepared.name).toBe("회사로고.png");
    expect(prepared.size).toBe(bytes.byteLength);
    expect(prepared.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(prepared.blob.size).toBe(bytes.byteLength);
  });

  it("2MB를 넘는 실제 파일은 줄이지 않아 그 크기 그대로 선언된다", async () => {
    const bytes = new Uint8Array(3 * 1024 * 1024);
    bytes.set(PNG_HEAD);
    const prepared = await prepareLogoFile(new File([bytes], "big.png", { type: "image/png" }));
    expect(prepared.size).toBe(3 * 1024 * 1024);
    expect(prepared.contentType).toBe("image/png");
  });
});
