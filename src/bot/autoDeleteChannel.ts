import type { Message } from "discord.js";
import { prisma } from "@/lib/prisma";

const AUTO_DELETE_MS = 5000;

/**
 * 관리자가 /설정수정으로 지정한 채널에 올라오는 모든 메시지(사람/봇 구분 없이)를
 * 5초 뒤 자동으로 삭제한다. 임시 상담/문의용 채널처럼 대화 기록을 남기지 않아야
 * 하는 채널에 쓰기 위한 기능이다.
 */
export async function handleAutoDeleteMessage(message: Message) {
  if (!message.guild) return;

  const settings = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
  if (!settings?.discordAutoDeleteChannelId) return;
  if (message.channelId !== settings.discordAutoDeleteChannelId) return;

  setTimeout(() => {
    message.delete().catch(() => {
      // 이미 삭제되었거나 권한이 없는 경우 등은 조용히 무시한다.
    });
  }, AUTO_DELETE_MS);
}
