import { EmbedBuilder } from "discord.js";

export const BRAND_COLOR = 0x6366f1;

export function won(n: number) {
  return `${n.toLocaleString("ko-KR")}원`;
}

export function pt(n: number) {
  return `${n.toLocaleString("ko-KR")}P`;
}

export function baseEmbed(title: string) {
  return new EmbedBuilder().setColor(BRAND_COLOR).setTitle(title).setTimestamp();
}

export function errorEmbed(message: string) {
  return new EmbedBuilder().setColor(0xef4444).setDescription(`❌ ${message}`);
}

export function successEmbed(message: string) {
  return new EmbedBuilder().setColor(0x22c55e).setDescription(`✅ ${message}`);
}
