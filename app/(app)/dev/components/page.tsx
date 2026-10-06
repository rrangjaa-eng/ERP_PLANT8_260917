import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { env } from "@/lib/env";
import { isDevToolsEnabled } from "@/lib/dev-tools";
import { Banner } from "@/ui/banner/Banner";
import { Button, type ButtonVariant } from "@/ui/button/Button";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { TextField } from "@/ui/input/TextField";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { Num } from "@/ui/num/Num";
import { Select } from "@/ui/select/Select";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { STATUS_KIND } from "@/ui/status-tag/status-map";
import { StaticTable } from "@/ui/table/StaticTable";
import { TableSkeleton } from "@/ui/table/TableSkeleton";
import {
  EditTableSample,
  GalleryPanel,
  ModalSample,
  PanelOpener,
  ReadTableSample,
  RowActionsSamples,
  SelectTableSample,
  ToastSample,
} from "./gallery-client";
import styles from "./components.module.css";

// 04.6-06 뼈대 + 04.6-13 전 구역(UI-SPEC 「컴포넌트 모음 페이지」, SC 2) — 개발·스테이징 전용. 메뉴 레지스트리에 없다.
// 값은 전부 코드 안 고정 표본이다(DB 조회 없음 — 시각 회귀 사진이 매번 같아야 한다).
export const dynamic = "force-dynamic";

const TIERS: ReadonlyArray<{ variant: ButtonVariant; label: string }> = [
  { variant: "primary", label: "1차" },
  { variant: "secondary", label: "2차" },
  { variant: "tertiary", label: "3차" },
];

const STATUS_WORDS = Object.keys(STATUS_KIND) as ReadonlyArray<keyof typeof STATUS_KIND>;

const SELECT_OPTIONS = [
  { value: "event", label: "행사" },
  { value: "promotion", label: "프로모션" },
];

const FRAMES: ReadonlyArray<{ key: "list" | "detail" | "form"; name: string; parts: string[] }> = [
  { key: "list", name: "목록 틀", parts: ["제목", "필터 · 1차", "합계 면", "표"] },
  { key: "detail", name: "상세 틀", parts: ["제목 · 상태", "2차 → 1차", "구역", "표"] },
  { key: "form", name: "폼 틀", parts: ["제목", "라벨 · 입력", "구역", "행동 줄"] },
];

export default async function ComponentsPage({ searchParams }: { searchParams: Promise<{ panel?: string }> }) {
  await requireSession();
  if (!isDevToolsEnabled(env.APP_ENV)) notFound();
  const { panel } = await searchParams;

  return (
    <DetailScreen
      title="컴포넌트 모음"
      actions={{
        secondary: <Button variant="secondary">표본 2차</Button>,
        primary: <Button variant="primary">표본 1차</Button>,
      }}
    >
      {TIERS.map(({ variant, label }) => (
        <DetailScreen.Section key={variant} title={`${label} 버튼`}>
          <div className={styles.samples}>
            <Button variant={variant}>{`${label} 기본`}</Button>
            <Button variant={variant} disabled disabledReason="권한 없음 · 담당에게 요청">
              {`${label} 비활성`}
            </Button>
            <Button variant={variant} pending>
              {`${label} 진행 중`}
            </Button>
          </div>
        </DetailScreen.Section>
      ))}

      <DetailScreen.Section title="입력">
        <div className={styles.fields}>
          <TextField id="gallery-input-default" label="기본" defaultValue="표본 값" />
          <TextField id="gallery-input-error" label="오류" defaultValue="표본 값" error="형식 오류" />
          <TextField id="gallery-input-disabled" label="비활성" defaultValue="표본 값" disabled />
        </div>
      </DetailScreen.Section>

      <DetailScreen.Section title="선택">
        <div className={styles.fields}>
          <label htmlFor="gallery-select" className={styles.fieldLabel}>
            분류
          </label>
          <Select id="gallery-select" options={SELECT_OPTIONS} defaultValue="event" />
        </div>
      </DetailScreen.Section>

      <DetailScreen.Section title="상태 배지">
        <ul data-gallery="status-badges" className={styles.badges}>
          {STATUS_WORDS.flatMap((word) => [
            <li key={`${word}-tag`}>
              <StatusTag status={word} />
            </li>,
            <li key={`${word}-text`}>
              <StatusTag status={word} variant="text" />
            </li>,
          ])}
        </ul>
      </DetailScreen.Section>

      <DetailScreen.Section title="숫자">
        <dl data-gallery="numbers" className={styles.numbers}>
          <div>
            <dt>큰 금액</dt>
            <dd>
              <Num value={1234567890} />
            </dd>
          </div>
          <div>
            <dt>음수</dt>
            <dd>
              <Num value={-4500000} />
            </dd>
          </div>
          <div>
            <dt>외화 2행</dt>
            <dd>
              <Num value={5720000} fx={{ currency: "USD", amount: 4400, rate: 1300 }} />
            </dd>
          </div>
          <div>
            <dt>건수 · 수량 · 비율</dt>
            <dd>
              <Num value={12} unit="count" /> · <Num value={3.5} unit="quantity" /> · <Num value={12.5} unit="percent" />
            </dd>
          </div>
          <div>
            <dt>값 없음</dt>
            <dd>
              <Num value={null} />
            </dd>
          </div>
        </dl>
      </DetailScreen.Section>

      <DetailScreen.Section title="표 읽기">
        <div data-gallery="table-read">
          <ReadTableSample />
        </div>
      </DetailScreen.Section>

      <DetailScreen.Section title="표 편집">
        <div data-gallery="table-edit">
          <EditTableSample />
        </div>
      </DetailScreen.Section>

      <DetailScreen.Section title="표 선택">
        <div data-gallery="table-select">
          <SelectTableSample />
        </div>
      </DetailScreen.Section>

      <DetailScreen.Section title="표 서버 고정">
        <div data-gallery="table-static">
          <StaticTable
            caption="서버 고정 표 표본"
            columns={[
              { key: "name", header: "이름", priority: "p1", rowHeader: true },
              { key: "amount", header: "금액", priority: "p1", align: "right" },
              { key: "status", header: "상태", priority: "p2" },
              { key: "note", header: "비고", priority: "p3" },
            ]}
            rows={[
              {
                key: "a",
                headerId: "gallery-static-a",
                cells: ["표본 가", <Num key="n" value={1250000} />, <StatusTag key="s" status="승인" variant="text" />, "비고 가"],
              },
              {
                key: "b",
                headerId: "gallery-static-b",
                cells: ["표본 나", <Num key="n" value={-30000} />, <StatusTag key="s" status="대기" variant="text" />, "비고 나"],
              },
            ]}
          />
        </div>
      </DetailScreen.Section>

      <DetailScreen.Section title="표 불러오는 중">
        <TableSkeleton
          columns={[
            { key: "name", label: "항목" },
            { key: "amount", label: "금액", align: "right" },
          ]}
          withFooter
        />
      </DetailScreen.Section>

      <DetailScreen.Section title="빈 목록">
        <ListEmpty message="표본 없음" action={{ label: "표본 추가", href: "/dev/components" }} />
      </DetailScreen.Section>

      <DetailScreen.Section title="행 동작">
        <RowActionsSamples />
      </DetailScreen.Section>

      <DetailScreen.Section title="합계 면">
        <div className={styles.totalFace}>
          <span>합계</span>
          <Num value={7140000} />
        </div>
      </DetailScreen.Section>

      <DetailScreen.Section title="토스트">
        <ToastSample />
      </DetailScreen.Section>

      <DetailScreen.Section title="배너">
        <div data-gallery="banners">
          <Banner kind="info">임시 비밀번호 사용 중</Banner>
          <Banner kind="warning">연결 한도 초과</Banner>
        </div>
      </DetailScreen.Section>

      <DetailScreen.Section title="모달">
        <ModalSample />
      </DetailScreen.Section>

      <DetailScreen.Section title="옆 패널">
        <PanelOpener />
      </DetailScreen.Section>

      <DetailScreen.Section title="화면 틀">
        <div data-gallery="frames" className={styles.frames}>
          {FRAMES.map(({ key, name, parts }) => (
            <div key={key} data-gallery-frame={key} className={styles.frame}>
              <p className={styles.frameName}>{name}</p>
              {parts.map((part) => (
                <div key={part} className={styles.framePart}>
                  {part}
                </div>
              ))}
            </div>
          ))}
        </div>
      </DetailScreen.Section>

      {panel === "1" ? <GalleryPanel /> : null}
    </DetailScreen>
  );
}
