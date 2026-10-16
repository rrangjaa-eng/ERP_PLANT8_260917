import { cfbStreamNames, decodeCp949, readWorkbookRows, zipEntryStats, type ReadBook, type ReadWorkbookOptions } from "@/lib/xlsx-server";

// 06.1-02: 바이트 판별(확장자가 아니라 내용 — D-6102 · E39)과 SheetJS 래퍼 호출. SheetJS는 lib/xlsx-server.ts만 부른다(EP2-C1).
// 래퍼 예외는 여기서 거절 종류로 바꾼다 — 「처리 중 오류」로 새지 않는다(E9).

export type Sniff = "cfb" | "xlsx" | "html" | "csv" | "unknown";

const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const HEAD_BYTES = 1024;

export function sniff(bytes: Uint8Array): Sniff {
  if (CFB_MAGIC.every((b, i) => bytes[i] === b)) return "cfb";
  if (ZIP_MAGIC.every((b, i) => bytes[i] === b)) return "xlsx";
  const head = bytes.subarray(0, HEAD_BYTES);
  if (head.length === 0 || head.includes(0)) return "unknown";
  const text = new TextDecoder("utf-8", { fatal: false }).decode(head).replace(/^﻿/, "").toLowerCase();
  if (text.trimStart().startsWith("<") || text.includes("<html") || text.includes("<table")) return "html";
  return "csv";
}

export type WorkbookDeps = {
  readWorkbookRows: typeof readWorkbookRows;
  zipEntryStats: typeof zipEntryStats;
  cfbStreamNames: typeof cfbStreamNames;
  decodeCp949: typeof decodeCp949;
};

export const DEFAULT_WORKBOOK_DEPS: WorkbookDeps = { readWorkbookRows, zipEntryStats, cfbStreamNames, decodeCp949 };

// csv 글자 풀기: UTF-8(BOM 허용)로 엄격히 풀리지 않으면 CP949(PA-CSV).
export function decodeCsvText(bytes: Uint8Array, deps: WorkbookDeps): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return deps.decodeCp949(bytes);
  }
}

export type SheetSource = { container: "csv"; text: string } | { container: "cfb" | "xlsx"; bytes: Uint8Array };
export type SheetsResult = { ok: true; book: ReadBook } | { ok: false; kind: "not-excel" | "encrypted" };

function looksEncrypted(source: SheetSource, error: unknown, deps: WorkbookDeps): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (/password|encrypt/i.test(message)) return true;
  if (source.container !== "cfb") return false;
  return (deps.cfbStreamNames(source.bytes) ?? []).some((name) => name.endsWith("EncryptedPackage"));
}

export function readSheets(source: SheetSource, opts: ReadWorkbookOptions, deps: WorkbookDeps): SheetsResult {
  try {
    const input = source.container === "csv" ? { text: source.text } : source.bytes;
    return { ok: true, book: deps.readWorkbookRows(input, opts) };
  } catch (error) {
    return { ok: false, kind: looksEncrypted(source, error, deps) ? "encrypted" : "not-excel" };
  }
}
