import { env, resolvedStorageDriver } from "@/lib/env";
import { localStorageFromEnv, verifyLocalSignedRequest } from "@/lib/gcp/storage";
import { log } from "@/lib/log";

// 05-04(EVID-01): 로컬 · CI 증빙 저장소 창구 — 서명된 로컬 주소(lib/gcp/storage.ts)로 바이트를 올리고 내려받는다.
// 세션 인증을 쓰지 않는다: 서명 주소가 권한이고, 발급은 도메인의 권한 판정 뒤에만 한다. 드라이버가 local이 아니면
// (staging · prod) 첫 판정에서 404 — 키 · 쿼리 문자열은 로그에 싣지 않는다(T-05-405 · F7).
export const dynamic = "force-dynamic";

function blocked(method: "PUT" | "GET"): Response {
  log.warn("storage.local_route_blocked", { method, reason: "driver_not_local" });
  return new Response(null, { status: 404 });
}

// RFC 5987 — encodeURIComponent가 남기는 ' ( ) * 까지 이스케이프.
function encodeFilename(filename: string): string {
  return encodeURIComponent(filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export async function PUT(request: Request): Promise<Response> {
  if (resolvedStorageDriver(env) !== "local") return blocked("PUT");
  const contentLength = Number(request.headers.get("content-length") ?? Number.NaN);
  const checked = verifyLocalSignedRequest(request.url, {
    secret: env.BETTER_AUTH_SECRET ?? "",
    method: "PUT",
    contentLength,
    contentType: request.headers.get("content-type") ?? "",
    shaHeader: request.headers.get("x-goog-meta-sha256") ?? "",
    now: new Date(),
  });
  if (!checked.ok || checked.op !== "put") return new Response(null, { status: 403 });

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength !== contentLength) return new Response(null, { status: 400 });
  await localStorageFromEnv().writeObject(checked.key, bytes, { size: bytes.byteLength, contentType: checked.contentType, sha256: checked.sha256 });
  return new Response(null, { status: 201 });
}

export async function GET(request: Request): Promise<Response> {
  if (resolvedStorageDriver(env) !== "local") return blocked("GET");
  const checked = verifyLocalSignedRequest(request.url, { secret: env.BETTER_AUTH_SECRET ?? "", method: "GET", now: new Date() });
  if (!checked.ok || checked.op !== "get") return new Response(null, { status: 403 });

  const object = await localStorageFromEnv().readObject(checked.key);
  if (!object) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(object.bytes), {
    status: 200,
    headers: {
      "Content-Type": object.metadata.contentType,
      "Content-Disposition": `${checked.disposition}; filename*=UTF-8''${encodeFilename(checked.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
