import { createHash, randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { GoogleAuth } from "google-auth-library";
import { createAuthedRequest, type GcsRequest } from "@/lib/gcp/gcs";
import { createGcsStorage, type GcsSigner, type ObjectStorage } from "@/lib/gcp/storage";

// 05-12 Task 3 스파이크(DB · 앱 서버 없음): 실제 GCS가 gcs 드라이버의 손으로 만든 V4 서명을 받는지 staging 증빙 버킷에서 한 번
// 확인한다 — incoming/ 서명 PUT → 메타데이터 → evidence/로 옮기기 → 옮긴 뒤 메타데이터 → 보존 표식 → 서명 GET → 크기 초과 PUT
// 거부 → 삭제. 절차는 docs/EVIDENCE-STORAGE.md 「staging 스모크」.
//
// 자격: 런타임 SA 가장(gcloud auth application-default login --impersonate-service-account=…)의 기본 자격. 서명은 Cloud Run과
// 같은 갈래로 부른다 — 런타임 SA 자신의 토큰(cloud-platform 범위)으로 자기 자신의 IAM signBlob(부트스트랩 (d-3)의 자기
// TokenCreator 바인딩이 필요). GoogleAuth.sign은 가장 자격이면 사람 계정으로 signBlob을 불러 그 바인딩을 증명하지 못한다.
// 출력은 단계 이름 · PASS/FAIL · 상태 코드(와 GCS 오류 코드)뿐 — 주소 · 서명 · 이메일 · 버킷 이름은 찍지 않는다.
export class UsageError extends Error {}

export function parseArgs(argv: string[]): { bucket: string } {
  let bucket = "";
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] ?? "";
    if (token.startsWith("--") && token.includes("=")) throw new UsageError(`등호 결합(--flag=value) 토큰은 지원하지 않습니다: ${token}`);
    if (token === "--bucket") {
      bucket = argv[i + 1] ?? "";
      i += 1;
    } else {
      throw new UsageError(`알 수 없는 인자: ${token}`);
    }
  }
  if (!bucket) throw new UsageError("사용법: pnpm tsx scripts/gcs-sign-smoke.ts --bucket <버킷 이름>");
  return { bucket };
}

const CLOUD_PLATFORM = "https://www.googleapis.com/auth/cloud-platform";

function selfSigner(auth: GoogleAuth): GcsSigner {
  return {
    getCredentials: () => auth.getCredentials(),
    async sign(data) {
      const { client_email: email } = await auth.getCredentials();
      if (!email) throw new Error("서명 계정 없음 — 런타임 SA 가장 자격이 필요합니다");
      const res = await auth.request<{ signedBlob: string }>({
        method: "POST",
        url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(email)}:signBlob`,
        data: { payload: Buffer.from(data).toString("base64") },
      });
      return res.data.signedBlob;
    },
  };
}

type Step = { ok: boolean; status: string };
const results: boolean[] = [];

function report(name: string, step: Step): boolean {
  results.push(step.ok);
  console.log(`${step.ok ? "PASS" : "FAIL"} ${name} ${step.status}`);
  return step.ok;
}

async function gcsErrorCode(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  return body.match(/<Code>([A-Za-z]+)<\/Code>/)?.[1] ?? "";
}

async function attempt(run: () => Promise<Step>): Promise<Step> {
  try {
    return await run();
  } catch (error) {
    return { ok: false, status: error instanceof Error ? error.name : "error" };
  }
}

async function smoke(bucket: string): Promise<boolean> {
  const auth = new GoogleAuth({ scopes: [CLOUD_PLATFORM] });
  const request: GcsRequest = createAuthedRequest(() =>
    new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/devstorage.read_write"] }).getClient(),
  );
  const storage: ObjectStorage = createGcsStorage({ bucket, auth: selfSigner(auth), request });
  const objectUrl = (key: string) => `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(key)}`;

  const bytes = randomBytes(1024);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const incomingKey = `incoming/${randomUUID()}`;
  const evidenceKey = `evidence/${randomUUID()}`;
  const oversizeKey = `incoming/${randomUUID()}`;
  const sameMeta = (m: Awaited<ReturnType<ObjectStorage["getMetadata"]>>) =>
    m !== null && m.size === bytes.length && m.contentType === "image/jpeg" && m.sha256 === sha256;

  try {
    const put = await attempt(async () => {
      const signed = await storage.createSignedPut(incomingKey, { contentType: "image/jpeg", maxBytes: 2048, sha256, expiresSec: 900 });
      const res = await fetch(signed.url, { method: "PUT", headers: signed.headers, body: Uint8Array.from(bytes) });
      return { ok: res.status === 200, status: `${res.status} ${res.ok ? "" : await gcsErrorCode(res)}`.trim() };
    });
    if (!report("put(incoming/ 서명 PUT)", put)) return false;

    report("metadata(크기 · 형식 · sha256)", await attempt(async () => ({ ok: sameMeta(await storage.getMetadata(incomingKey)), status: "-" })));

    report("move(incoming/ → evidence/)", await attempt(async () => {
      await storage.move(incomingKey, evidenceKey);
      return { ok: true, status: "-" };
    }));

    report("metadata-after-move(원본 없음 · 옮긴 객체 메타 그대로)", await attempt(async () => ({
      ok: (await storage.getMetadata(incomingKey)) === null && sameMeta(await storage.getMetadata(evidenceKey)),
      status: "-",
    })));

    report("retain(temporaryHold)", await attempt(async () => {
      await storage.retain(evidenceKey);
      const res = await request({ op: "meta", method: "GET", url: objectUrl(evidenceKey) });
      const body = JSON.parse((res.data ?? Buffer.alloc(0)).toString("utf8") || "{}") as { temporaryHold?: boolean };
      return { ok: res.status === 200 && body.temporaryHold === true, status: String(res.status) };
    }));

    report("get(evidence/ 서명 GET · 바이트 일치)", await attempt(async () => {
      const signed = await storage.createSignedGet(evidenceKey, { expiresSec: 300, filename: "스모크.jpg", disposition: "inline" });
      const res = await fetch(signed.url);
      const body = Buffer.from(await res.arrayBuffer());
      return { ok: res.status === 200 && body.equals(bytes), status: `${res.status} ${res.ok ? "" : await gcsErrorCode(res)}`.trim() };
    }));

    report("oversize-put(한도 2048 · 4096바이트)", await attempt(async () => {
      const big = randomBytes(4096);
      const bigSha = createHash("sha256").update(big).digest("hex");
      const signed = await storage.createSignedPut(oversizeKey, { contentType: "image/jpeg", maxBytes: 2048, sha256: bigSha, expiresSec: 900 });
      const res = await fetch(signed.url, { method: "PUT", headers: signed.headers, body: Uint8Array.from(big) });
      return { ok: res.status >= 400 && res.status < 500, status: `${res.status}(4xx 기대) ${res.ok ? "" : await gcsErrorCode(res)}`.trim() };
    }));

    report("delete(표식 해제 뒤 삭제)", await attempt(async () => {
      const release = await request({
        op: "retain",
        method: "PATCH",
        url: objectUrl(evidenceKey),
        headers: { "Content-Type": "application/json" },
        body: Buffer.from(JSON.stringify({ temporaryHold: false })),
      });
      await storage.delete(evidenceKey);
      return { ok: release.status === 200 && (await storage.getMetadata(evidenceKey)) === null, status: String(release.status) };
    }));
  } finally {
    // 어느 단계에서 멈춰도 스파이크 객체를 남기지 않는다(없으면 성공).
    await request({ op: "retain", method: "PATCH", url: objectUrl(evidenceKey), headers: { "Content-Type": "application/json" }, body: Buffer.from(JSON.stringify({ temporaryHold: false })) }).catch(() => undefined);
    for (const key of [incomingKey, evidenceKey, oversizeKey]) await storage.delete(key).catch(() => undefined);
  }
  return results.every(Boolean);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void Promise.resolve()
    .then(() => smoke(parseArgs(process.argv.slice(2)).bucket))
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
