import { REST, Routes } from "discord.js";
import { BOT_TOKEN, CLIENT_ID } from "@/bot/env";
import { commands } from "@/bot/commandRegistry";

// "자판기 판매"로 생긴 테넌트 샵들도 전부 같은 봇 하나를 자기 서버에 초대해서 쓴다
// (src/lib/shop.ts의 guildId 기준 분기). 길드 전용 등록(applicationGuildCommands)은
// 그 길드 하나에만 보이고 새로 초대되는 테넌트 서버에는 안 보이므로, 반드시 전역
// 등록(applicationCommands)을 써야 한다 - 전파에 최대 1시간 정도 걸릴 수 있다.
async function main() {
  const rest = new REST().setToken(BOT_TOKEN);
  const body = commands.map((c) => c.data.toJSON());

  // 예전엔 길드 전용으로 등록했었다 - 그대로 두면 전역 등록분과 겹쳐서 자비샵 서버에만
  // 커맨드가 중복으로 보인다. 길드 전용 등록을 빈 배열로 덮어써서 깨끗하게 지운다.
  const oldGuildId = process.env.DISCORD_GUILD_ID;
  if (oldGuildId) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, oldGuildId), { body: [] });
    console.log(`기존 길드(${oldGuildId}) 전용 등록을 정리했습니다.`);
  }

  console.log(`슬래시 커맨드 ${body.length}개를 전역 등록합니다 (모든 서버 - 새로 초대되는 테넌트 서버 포함)...`);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body });
  console.log("전역 등록 완료 - 새 서버에 반영되기까지 최대 1시간 정도 걸릴 수 있습니다 (기존 서버는 보통 더 빠름).");
}

main().catch((err) => {
  console.error("커맨드 등록 실패:", err);
  process.exitCode = 1;
});
