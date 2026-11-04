import type { ReactNode } from "react";
import type { PrintCompany } from "@/domain/print/company";
import { companyInfoLine, companyWordmark } from "./company-line";
import styles from "./print-frame.module.css";

// 07.4-01 D-7405 · D-7406: 머리 — A줄(워드마크 자리 + 출력 일시), B줄(회사 정보, 빈 항목은 이름째 빠지고 전부 비면 줄 자체가 없다).
// logo가 있으면 그 자리에 들어가고 B줄 맨 앞에 회사명이 붙는다(07.4는 logo를 넘기지 않는다).
export function PrintHeader({ company, printedAt, logo }: { company: PrintCompany; printedAt: string; logo?: ReactNode }) {
  const info = companyInfoLine(company);
  const name = company.name.trim();
  const line = logo && name !== "" ? [name, info].filter((part) => part !== null).join(" · ") : info;
  return (
    <header>
      <div className={styles.top}>
        {logo ?? <span className={styles.mark}>{companyWordmark(company.name)}</span>}
        <span className={styles.printedAt}>출력 {printedAt}</span>
      </div>
      {line ? <p className={styles.company}>{line}</p> : null}
    </header>
  );
}
