import { SlashCommandBuilder } from "discord.js";
import { prisma, runWithTenant } from "@/lib/prisma";
import { applyShopGuildId } from "@/lib/provisionShop";
import { panelError, panelSuccess } from "@/bot/ui";
import type { BotCommand } from "@/bot/types";

// "자판기 통째로 구매"는 슬래시 커맨드가 아니라 상품 목록의 다른 등급과 똑같이
// "구매하기" 버튼으로 산다 - src/lib/orders.ts의 purchaseTier 참고. 구매하면 전용
// 웹사이트(slug.krl.kr)와 디스코드 봇 연동이 함께 제공된다. 웹사이트 로그인은
// /샵봇설정으로 등록한 구매자 본인의 디스코드 OAuth 앱을 사용한다 (src/bot/commands/shopOAuthSetup.ts).

export const shopClaimCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("샵연동")
    .setDescription("구매한 샵을 지금 이 디스코드 서버와 연결합니다.")
    .addStringOption((o) => o.setName("샵코드").setDescription("구매 완료 메시지에 적혀있던 샵 코드").setRequired(true)),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const slug = interaction.options.getString("샵코드", true).trim().toLowerCase();
    const guildId = interaction.guildId;

    if (!guildId) {
      return interaction.editReply(panelError("서버 안에서만 사용할 수 있습니다."));
    }

    // Shop 레지스트리는 항상 자비샵 본인(기본) DB에만 있다 - 이 명령어를 이미 연동된
    // 서버 안에서 다시 실행하면 그 서버의 테넌트 DB로 자동 전환되어 있는 상태라서,
    // 명시적으로 기본 DB를 가리키지 않으면 "존재하지 않는 샵"이라는 잘못된 결과가 나온다.
    const shop = await runWithTenant(null, () => prisma.shop.findUnique({ where: { slug } }));
    if (!shop) return interaction.editReply(panelError("존재하지 않는 샵입니다."));
    if (shop.claimDiscordId !== interaction.user.id) {
      return interaction.editReply(panelError("이 샵을 구매한 본인만 연동할 수 있습니다."));
    }
    if (shop.discordGuildId) {
      if (shop.discordGuildId === guildId) {
        return interaction.editReply(panelError("이미 이 서버와 연동되어 있습니다."));
      }
      return interaction.editReply(panelError("이미 다른 서버와 연동되어 있습니다."));
    }
    const already = await runWithTenant(null, () => prisma.shop.findUnique({ where: { discordGuildId: guildId } }));
    if (already) {
      return interaction.editReply(panelError("이 서버는 이미 다른 샵과 연동되어 있습니다."));
    }

    // Shop 행 업데이트 + 이 샵 전용 프로세스에 DISCORD_GUILD_ID 주입 후 재시작까지
    // 한 번에 처리한다 (이게 있어야 관리자 권한 확인·구매 등급 역할·파트너 채널 생성
    // 등이 자비샵이 아니라 이 서버를 기준으로 동작한다).
    await applyShopGuildId(shop.slug, guildId);
    await interaction.editReply(
      panelSuccess(
        `이 서버가 "${shop.name}"(${shop.slug}) 샵과 연동되었습니다.\n이제 이 서버에서 상품 구매/쿠폰/장바구니/관리자 패널 등 모든 기능을 사용할 수 있습니다.\n(웹사이트 프로세스가 10~20초 정도 재시작됩니다.)`
      )
    );
  },
};
