"use client";

import { useEffect, useRef, useState } from "react";
import type { PrintCompany } from "@/domain/print/company";
import { companyWordmark } from "@/app/print/_frame/company-line";
import { PrintHeader } from "@/app/print/_frame/PrintHeader";
import styles from "@/app/print/_frame/print-frame.module.css";

// 07.2-10 Task 3 (D-7225 · 07.4 D-7406): 고객 견적서 머리 — 회사 로고가 있으면 워드마크 자리에 그림(B줄 맨 앞에 회사명이 붙는다), 없거나 못 읽으면
// 회사명 글자(비면 PLANT8)로 대신한다. 못 읽음 = 그림 오류 · 수화 전에 이미 깨진 그림(naturalWidth 0) · decode() 거부. 로고는 필수 이미지가 아니라
// 인쇄 준비(data-ready)를 늦추지 않고 오류 화면도 만들지 않는다. 실패 처리는 PrintHeader 밖(여기)에 둔다.
export function QuoteHeader({ company, logoUrl, printedAt, infoLabels }: { company: PrintCompany; logoUrl: string | null; printedAt: string | null; infoLabels: boolean }) {
  const [failed, setFailed] = useState(logoUrl === null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    let cancelled = false;
    const loaded = image.complete && image.naturalWidth === 0 ? Promise.reject(new Error("broken image")) : image.decode();
    loaded.catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [logoUrl]);

  if (failed || logoUrl === null) return <PrintHeader company={company} printedAt={printedAt} infoLabels={infoLabels} />;
  const logo = (
    // 서명된 읽기 주소 — next/image 최적화 대상이 아니다(확인증 서명 이미지 선례).
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={imageRef} className={styles.logo} src={logoUrl} alt={companyWordmark(company.name)} onError={() => setFailed(true)} />
  );
  return <PrintHeader company={company} printedAt={printedAt} infoLabels={infoLabels} logo={logo} />;
}
