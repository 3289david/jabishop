// ── 공통 패널 UI (Components V2) ─────────────────────────────────────
// 디스코드 Components V2(IsComponentsV2 플래그)로 패널을 구성한다. 기존 EmbedBuilder와
// 달리 색상/제목/본문/구분선/버튼이 모두 "컴포넌트 트리"로 들어가며, 이 플래그가 켜진
// 메시지는 content/embeds 필드를 전부 무시한다 - 그래서 패널을 보내는 쪽은 반드시
// buildPanel()이 반환하는 payload를 그대로(embeds를 따로 섞지 말고) 써야 한다.
//
// 디스코드 자체가 CSS를 지원하지 않아 블러/그림자/애니메이션 같은 진짜 유리효과는
// 불가능하다 - 대신 (1) 보라/파랑이 번지는 그라데이션 배너 이미지, (2) 모든 패널에
// 통일된 강조색(#A78BFA)과 얇은 구분선, (3) 소제목(-# 문법, 작고 흐린 텍스트)으로
// "푸터" 느낌을 내서 일관된 완성도를 준다. 버튼 색상 자체는 디스코드가 5가지
// 고정 스타일(Primary 파랑/Secondary 회색/Success 초록/Danger 빨강/Link 회색)만
// 허용해서 보라색으로 바꿀 수는 없다 - 대신 "주요 동작=Success, 보조 동작=Secondary,
// 위험 동작=Danger"로 전 패널에 걸쳐 스타일을 통일한다.
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ActionRowBuilder,
  MessageFlags,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import { getAppOrigin } from "@/lib/appUrl";

export const ACCENT_COLOR = 0xa78bfa; // 보라 #A78BFA - 모든 패널 공통 강조색
export const ERROR_ACCENT_COLOR = 0xef4444;
export const SUCCESS_ACCENT_COLOR = 0x22c55e;

/** 패널 상단 배너 (public/discord-banner-purple.jpg, 자비샵 로고). */
export function bannerImageUrl(): string {
  return `${getAppOrigin()}/discord-banner-purple.jpg`;
}

export type PanelField = { name: string; value: string };

export interface PanelOptions {
  title: string;
  description?: string;
  fields?: PanelField[];
  /** -# 소제목 문법으로 작게 표시되는 한 줄 - 기존 embed footer 역할. */
  footer?: string;
  /** 상단에 보라/파랑 그라데이션 배너를 붙일지 (프리미엄/대표 패널용). */
  banner?: boolean;
  /** 제목 옆에 작은 썸네일 이미지를 붙일지 (배너와 동시 사용 안 함). */
  thumbnailUrl?: string;
  /** 상단에 띄울 동적 이미지(구매 지급 이미지 등) - banner와 동시 사용 안 함. attachment://파일명도 가능. */
  imageUrl?: string;
  accentColor?: number;
  /** 버튼/셀렉트메뉴 행 (ActionRowBuilder). */
  rows?: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

/**
 * 모든 패널이 공통으로 쓰는 Components V2 빌더. 색상/제목/구분선/푸터 규칙을 한
 * 곳에서 관리해서, 명령어마다 레이아웃이 제각각이 되는 걸 막는다.
 */
export function buildPanel(opts: PanelOptions) {
  const container = new ContainerBuilder().setAccentColor(opts.accentColor ?? ACCENT_COLOR);

  if (opts.banner) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(bannerImageUrl()).setDescription(opts.title))
    );
  } else if (opts.imageUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(opts.imageUrl).setDescription(opts.title))
    );
  }

  const titleText = new TextDisplayBuilder().setContent(`### ${opts.title}`);
  if (opts.thumbnailUrl && !opts.banner) {
    container.addSectionComponents((s) => s.addTextDisplayComponents(titleText).setThumbnailAccessory(new ThumbnailBuilder().setURL(opts.thumbnailUrl!)));
  } else {
    container.addTextDisplayComponents(titleText);
  }

  if (opts.description) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(opts.description));
  }

  if (opts.fields?.length) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    const fieldsText = opts.fields.map((f) => `**${f.name}**\n${f.value}`).join("\n\n");
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(fieldsText.slice(0, 3900)));
  }

  for (const row of opts.rows ?? []) {
    container.addActionRowComponents(row);
  }

  if (opts.footer) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${opts.footer}`));
  }

  return { flags: MessageFlags.IsComponentsV2 as const, components: [container] };
}

export function panelError(message: string) {
  return buildPanel({ title: "❌ 오류", description: message, accentColor: ERROR_ACCENT_COLOR });
}

export function panelSuccess(message: string) {
  return buildPanel({ title: "✅ 완료", description: message, accentColor: SUCCESS_ACCENT_COLOR });
}

/** ephemeral(본인만 보임) 응답에 Components V2 플래그를 같이 얹어줄 때 쓰는 반복 보일러플레이트 축약. */
export function ephemeral<T extends { flags: number }>(payload: T): T & { flags: number } {
  return { ...payload, flags: payload.flags | MessageFlags.Ephemeral };
}

export { MessageFlags };

// ── 목록형 패널(항목마다 설명+버튼이 번갈아 나오는 경우) 전용 저수준 도구 ──
// 관리자 승인 대기 목록처럼 "항목 설명 → 그 항목 전용 버튼 → 다음 항목 설명 → ..."
// 순서가 필요한 패널은 buildPanel()의 일괄 fields/rows 배치로는 표현이 안 돼서,
// 컨테이너를 직접 조립할 수 있게 저수준 조각을 내보낸다.

export function startListContainer(title: string, description?: string, accentColor?: number) {
  const container = new ContainerBuilder()
    .setAccentColor(accentColor ?? ACCENT_COLOR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${title}`));
  if (description) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(description));
  return container;
}

/** 목록 항목 하나(설명 텍스트 + 그 아래 버튼 행)를 컨테이너에 추가한다. */
export function addListItem(
  container: ContainerBuilder,
  text: string,
  row?: ActionRowBuilder<MessageActionRowComponentBuilder>
) {
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text.slice(0, 3900)));
  if (row) container.addActionRowComponents(row);
  return container;
}

export function finishContainer(container: ContainerBuilder, footer?: string) {
  if (footer) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footer}`));
  }
  return { flags: MessageFlags.IsComponentsV2 as const, components: [container] };
}

export { ContainerBuilder };
