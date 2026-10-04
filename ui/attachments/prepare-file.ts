// 05-05(UI-SPEC S4): 올리기 전 브라우저에서 파일을 준비한다 — 이미지는 긴 변 2000 이하 JPEG로 줄이고, PDF · HEIC는 원본 그대로 둔다.
// 이어서 줄인(또는 원본) 바이트의 SHA-256 16진을 계산한다 — 서버 선언(size · contentType · sha256)과 서명 PUT 헤더가 같은 값을 쓴다.
// 새 패키지 없음: `createImageBitmap` · `canvas.toBlob` · `crypto.subtle`만 쓴다.

export const EVIDENCE_LONG_SIDE_MAX = 2000;
const JPEG_QUALITY = 0.85;
const HEIC_TYPES = ["image/heic", "image/heif"];

export type PreparedEvidence = {
  blob: Blob;
  name: string;
  size: number;
  contentType: string;
  sha256: string;
  // 로컬 미리보기(이미지만) — 호출부가 행이 사라질 때 `URL.revokeObjectURL`로 치운다.
  previewUrl: string | null;
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

// 브라우저가 형식을 비워 주는 HEIC(`.heic` · `.heif`)도 서버 허용 형식(`image/heic` · `image/heif`)으로 선언한다.
function declaredType(file: File): string {
  if (file.type) return file.type;
  const extension = extensionOf(file.name);
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  if (extension === "pdf") return "application/pdf";
  return "application/octet-stream";
}

async function downscaleToJpeg(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, EVIDENCE_LONG_SIDE_MAX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return null;
    }
    // 투명 PNG가 JPEG에서 검게 되지 않게 흰 바탕.
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  } catch {
    // 디코딩 실패 — 원본을 그대로 올려 서버 검사가 판정한다.
    return null;
  }
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function prepareEvidenceFile(file: File): Promise<PreparedEvidence> {
  const type = declaredType(file);
  let blob: Blob = file;
  let contentType = type;
  let name = file.name;
  if (type.startsWith("image/") && !HEIC_TYPES.includes(type)) {
    const reduced = await downscaleToJpeg(file);
    if (reduced) {
      blob = reduced;
      contentType = "image/jpeg";
      if (type !== "image/jpeg") name = `${file.name.replace(/\.[^.]+$/, "")}.jpg`;
    }
  }
  const sha256 = await sha256Hex(blob);
  return {
    blob,
    name,
    size: blob.size,
    contentType,
    sha256,
    previewUrl: contentType.startsWith("image/") && !HEIC_TYPES.includes(contentType) ? URL.createObjectURL(blob) : null,
  };
}
