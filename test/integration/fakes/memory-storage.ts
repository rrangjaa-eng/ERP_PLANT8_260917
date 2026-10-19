import { randomUUID } from "node:crypto";
import type { ObjectMetadata, ObjectStorage } from "@/lib/gcp/storage";

// 05-04: 통합 테스트용 ObjectStorage 메모리 가짜 — 도메인에 deps.storage로 주입한다. 서명 주소는 가짜 스킴이고
// 테스트가 fake.put(url, { size, contentType, sha256 })으로 객체를 넣는다(서명 헤더와 다르면 거부 — GCS 서명 조건과 같은 결).
// 옮기기 · 보존 표식 · 삭제는 기록으로 남겨 테스트가 단언한다. failNextMove · failRetain은 갈래 사례용 선택 옵션이다.
// 06.1-14(E14): readHead는 put이 받은 선택 칸 head를, 없으면 선언 형식의 서명 바이트를 돌려준다 — 기존 테스트는 그대로 통과한다.

type SignedPutRecord = { key: string; contentType: string; maxBytes: number; sha256: string };

export type MemoryStorage = ObjectStorage & {
  objects: Map<string, ObjectMetadata>;
  moves: { from: string; to: string }[];
  retains: string[];
  deletes: string[];
  signedGets: { key: string; expiresSec: number; filename: string; disposition: string }[];
  put(url: string, object: { size: number; contentType: string; sha256: string; head?: Uint8Array }): void;
  tamper(key: string, patch: Partial<ObjectMetadata>): void;
  failNextMove(): void;
  failRetain: boolean;
};

const pad16 = (bytes: readonly number[]) => Uint8Array.from([...bytes, ...new Array<number>(16 - bytes.length).fill(0)]);
const latin1 = (text: string) => [...Buffer.from(text, "latin1")];

// 선언 형식마다 서명 머리(16바이트) — domain/evidence/upload-checks.ts signatureMatches가 받는 꼴.
const SIGNATURE_HEADS: Record<string, Uint8Array> = {
  "image/jpeg": pad16([0xff, 0xd8, 0xff, 0xe0]),
  "image/png": pad16([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/webp": pad16([...latin1("RIFF"), 0, 0, 0, 0, ...latin1("WEBPVP8 ")]),
  "image/heic": pad16([0, 0, 0, 0x18, ...latin1("ftypheic")]),
  "image/heif": pad16([0, 0, 0, 0x18, ...latin1("ftypmif1")]),
  "application/pdf": pad16(latin1("%PDF-1.7\n")),
};

export function createMemoryStorage(): MemoryStorage {
  const signed = new Map<string, SignedPutRecord>();
  const heads = new Map<string, Uint8Array>();
  let moveFailures = 0;

  const storage: MemoryStorage = {
    objects: new Map(),
    moves: [],
    retains: [],
    deletes: [],
    signedGets: [],
    failRetain: false,

    createSignedPut(key, opts) {
      const url = `memory://put/${key}?sig=${randomUUID()}`;
      signed.set(url, { key, contentType: opts.contentType, maxBytes: opts.maxBytes, sha256: opts.sha256 });
      return Promise.resolve({
        url,
        method: "PUT" as const,
        headers: {
          "Content-Type": opts.contentType,
          "X-Goog-Content-Length-Range": `1,${opts.maxBytes}`,
          "x-goog-meta-sha256": opts.sha256,
        },
      });
    },

    createSignedGet(key, opts) {
      storage.signedGets.push({ key, ...opts });
      return Promise.resolve({ url: `memory://get/${key}?exp=${opts.expiresSec}` });
    },

    getMetadata(key) {
      const object = storage.objects.get(key);
      return Promise.resolve(object ? { ...object } : null);
    },

    readHead(key, bytes) {
      const object = storage.objects.get(key);
      if (!object) return Promise.resolve(null);
      const head = heads.get(key) ?? SIGNATURE_HEADS[object.contentType] ?? new Uint8Array(0);
      return Promise.resolve(head.subarray(0, bytes));
    },

    move(fromKey, toKey) {
      if (moveFailures > 0) {
        moveFailures -= 1;
        return Promise.reject(new Error("memory storage: move failed (injected)"));
      }
      const object = storage.objects.get(fromKey);
      if (!object) return Promise.reject(new Error(`memory storage: no object ${fromKey}`));
      storage.objects.set(toKey, { ...object });
      storage.objects.delete(fromKey);
      const head = heads.get(fromKey);
      heads.delete(fromKey);
      if (head) heads.set(toKey, head);
      storage.moves.push({ from: fromKey, to: toKey });
      return Promise.resolve();
    },

    delete(key) {
      storage.objects.delete(key);
      heads.delete(key);
      storage.deletes.push(key);
      return Promise.resolve();
    },

    retain(key) {
      if (storage.failRetain) return Promise.reject(new Error("memory storage: retain failed (injected)"));
      storage.retains.push(key);
      return Promise.resolve();
    },

    put(url, object) {
      const record = signed.get(url);
      if (!record) throw new Error("memory storage: unsigned url");
      if (object.contentType !== record.contentType) throw new Error("memory storage: content-type mismatch");
      if (object.sha256 !== record.sha256) throw new Error("memory storage: sha256 mismatch");
      if (object.size < 1 || object.size > record.maxBytes) throw new Error("memory storage: size out of range");
      storage.objects.set(record.key, { size: object.size, contentType: object.contentType, sha256: object.sha256 });
      if (object.head) heads.set(record.key, object.head);
      else heads.delete(record.key);
    },

    tamper(key, patch) {
      const object = storage.objects.get(key);
      if (!object) throw new Error(`memory storage: no object ${key}`);
      storage.objects.set(key, { ...object, ...patch });
    },

    failNextMove() {
      moveFailures += 1;
    },
  };
  return storage;
}
