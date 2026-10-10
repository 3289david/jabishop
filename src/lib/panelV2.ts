// ── Components V2 raw-JSON 빌더 (discord.js 비의존) ──────────────────────
// src/bot/ui.ts와 똑같은 레이아웃 규칙(강조색 #A78BFA, 구분선, -# 소제목)을
// 쓰지만, 여긴 discord.js 빌더 없이 Discord REST API가 그대로 받는 JSON
// 스키마를 직접 조립한다 - 이 파일은 웹(Next.js 서버 액션)과 봇 양쪽에서
// discord.js 의존 없이 쓰는 공용 lib 코드(discordNotify.ts 등)용이라서.
// (컴포넌트 type 번호: 10=Text Display, 12=Media Gallery, 14=Separator, 17=Container)

export const V2_FLAG = 1 << 15; // MessageFlags.IsComponentsV2

export const V2_ACCENT_COLOR = 0xa78bfa;
export const V2_ERROR_COLOR = 0xef4444;
export const V2_SUCCESS_COLOR = 0x22c55e;
export const V2_WARNING_COLOR = 0xf59e0b;

export type V2Field = { name: string; value: string };

export interface V2PanelOptions {
  title: string;
  description?: string;
  fields?: V2Field[];
  /** -# 소제목 문법 - 기존 embed footer 역할. */
  footer?: string;
  accentColor?: number;
  /** 상단에 띄울 이미지 (attachment://파일명 또는 URL). */
  imageUrl?: string;
}

/** discordNotify.ts의 sendDiscordDM/sendChannelMessage가 그대로 받는 {flags, components} 페이로드를 만든다. */
export function buildV2Panel(opts: V2PanelOptions): { flags: number; components: unknown[] } {
  const children: unknown[] = [];

  if (opts.imageUrl) {
    children.push({ type: 12, items: [{ media: { url: opts.imageUrl }, description: opts.title }] });
  }

  children.push({ type: 10, content: `### ${opts.title}` });
  if (opts.description) children.push({ type: 10, content: opts.description });

  if (opts.fields?.length) {
    children.push({ type: 14, divider: true, spacing: 1 });
    const fieldsText = opts.fields.map((f) => `**${f.name}**\n${f.value}`).join("\n\n");
    children.push({ type: 10, content: fieldsText.slice(0, 3900) });
  }

  if (opts.footer) {
    children.push({ type: 14, divider: true, spacing: 1 });
    children.push({ type: 10, content: `-# ${opts.footer}` });
  }

  return { flags: V2_FLAG, components: [{ type: 17, accent_color: opts.accentColor ?? V2_ACCENT_COLOR, components: children }] };
}
