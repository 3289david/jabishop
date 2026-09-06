import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} 환경변수가 설정되지 않았습니다. .env 파일을 확인해주세요.`);
  return v;
}

export const BOT_TOKEN = required("DISCORD_BOT_TOKEN");
export const CLIENT_ID = required("DISCORD_CLIENT_ID");
export const GUILD_ID = process.env.DISCORD_GUILD_ID || undefined;
