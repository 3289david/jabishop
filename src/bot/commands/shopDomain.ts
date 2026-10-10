import { SlashCommandBuilder } from "discord.js";
import { prisma, runWithTenant } from "@/lib/prisma";
import { changeShopSlug, tenantOAuthRedirectUri, tenantAdminOAuthRedirectUri } from "@/lib/provisionShop";
import { getAppOrigin } from "@/lib/appUrl";
import { buildPanel, panelError, ephemeral } from "@/bot/ui";
import type { BotCommand } from "@/bot/types";

// 웹사이트 주소(서브도메인)는 구매 시 자동으로 정해지는데, 원하는 이름으로 직접
// 바꿀 수 있게 해주는 명령어. 반드시 이 샵과 연동된 서버 안에서, 구매한 본인이
// 실행해야 한다 (src/bot/commands/shopOAuthSetup.ts와 동일한 권한 확인 방식).
export const shopDomainChangeCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("샵주소변경")
    .setDescription("내 샵의 웹사이트 주소(서브도메인)를 원하는 이름으로 바꿉니다.")
    .addStringOption((o) =>
      o.setName("새주소").setDescription("영문 소문자/숫자/하이픈 3~30자 (예: myshop)").setRequired(true)
    ),
  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      return interaction.reply(ephemeral(panelError("서버 안에서만 사용할 수 있습니다.")));
    }
    const shop = await runWithTenant(null, () => prisma.shop.findUnique({ where: { discordGuildId: guildId } }));
    if (!shop) {
      return interaction.reply(ephemeral(panelError("이 서버는 연동된 샵이 없습니다. 먼저 `/샵연동`을 실행해주세요.")));
    }
    if (shop.claimDiscordId !== interaction.user.id) {
      return interaction.reply(ephemeral(panelError("이 샵을 구매한 본인만 변경할 수 있습니다.")));
    }

    const newSlug = interaction.options.getString("새주소", true).trim().toLowerCase();
    await interaction.deferReply({ ephemeral: true });

    let result;
    try {
      result = await changeShopSlug(shop.slug, newSlug);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return interaction.editReply(panelError(message));
    }

    const hadOAuth = !!shop.discordOAuthClientId;
    const fields = [
      { name: "새 웹사이트 주소", value: result.url },
      { name: "새 입금 자동승인 웹훅 URL", value: `${getAppOrigin()}/api/webhooks/bank-topup/${newSlug}` },
      {
        name: "입금 자동승인 앱 설정 변경 필요",
        value: "설치된 앱에서 웹훅 URL을 위 새 주소로 바꿔주세요 (비밀키는 그대로 써도 됩니다).",
      },
    ];
    if (hadOAuth) {
      fields.push({
        name: "⚠️ 디스코드 OAuth REDIRECT URI 재등록 필요",
        value:
          `기존에 등록해둔 REDIRECT URI는 더 이상 쓸 수 없습니다. 디스코드 개발자 포털 OAuth2 화면에서 아래 2개로 다시 등록해주세요:\n` +
          `\`${tenantOAuthRedirectUri(newSlug)}\`\n\`${tenantAdminOAuthRedirectUri(newSlug)}\``,
      });
    }

    await interaction.editReply(
      buildPanel({
        title: "✅ 샵 주소 변경 완료",
        description: `샵 주소가 \`${newSlug}.krl.kr\`로 변경되었습니다. 📌 꼭 확인해주세요:`,
        fields,
      })
    );
  },
};
