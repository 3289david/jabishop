import { REST, Routes } from "discord.js";
import { BOT_TOKEN, CLIENT_ID, GUILD_ID } from "@/bot/env";
import { commands } from "@/bot/commandRegistry";

async function main() {
  const rest = new REST().setToken(BOT_TOKEN);
  const body = commands.map((c) => c.data.toJSON());

  console.log(`슬래시 커맨드 ${body.length}개를 등록합니다...`);

  if (GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body });
    console.log(`길드(${GUILD_ID}) 전용으로 등록 완료 - 즉시 반영됩니다.`);
  } else {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body });
    console.log("전역 등록 완료 - 모든 서버에 반영되기까지 최대 1시간 정도 걸릴 수 있습니다.");
  }
}

main().catch((err) => {
  console.error("커맨드 등록 실패:", err);
  process.exitCode = 1;
});
