import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type ModalSubmitInteraction,
} from "discord.js";
import { prisma, runWithTenant } from "@/lib/prisma";
import { applyShopOAuthCredentials, tenantOAuthRedirectUri, tenantAdminOAuthRedirectUri } from "@/lib/provisionShop";
import { errorEmbed, successEmbed, baseEmbed } from "@/bot/format";
import type { BotCommand } from "@/bot/types";

export const SHOP_OAUTH_MODAL_ID = "shop_oauth_modal";

// 테넌트 웹사이트 로그인은 자비샵 OAuth 앱을 같이 쓰지 않는다 - REDIRECT URI가 도메인에
// 묶여있어서, 각 샵 주인이 본인 디스코드 개발자 포털에서 만든 앱을 등록해야 한다.
// 이 명령어는 반드시 이 샵과 연동된 서버 안에서, 구매한 본인이 실행해야 한다.
export const shopOAuthSetupCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("샵봇설정")
    .setDescription("내 샵 웹사이트 로그인에 쓸 디스코드 OAuth 앱(Client ID/Secret)을 등록합니다."),
  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      return interaction.reply({ embeds: [errorEmbed("서버 안에서만 사용할 수 있습니다.")], ephemeral: true });
    }
    const shop = await runWithTenant(null, () => prisma.shop.findUnique({ where: { discordGuildId: guildId } }));
    if (!shop) {
      return interaction.reply({
        embeds: [errorEmbed("이 서버는 연동된 샵이 없습니다. 먼저 `/샵연동`을 실행해주세요.")],
        ephemeral: true,
      });
    }
    if (shop.claimDiscordId !== interaction.user.id) {
      return interaction.reply({ embeds: [errorEmbed("이 샵을 구매한 본인만 설정할 수 있습니다.")], ephemeral: true });
    }

    const modal = new ModalBuilder().setCustomId(`${SHOP_OAUTH_MODAL_ID}:${shop.slug}`).setTitle("디스코드 OAuth 앱 등록");
    const clientId = new TextInputBuilder()
      .setCustomId("clientId")
      .setLabel("Client ID")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    if (shop.discordOAuthClientId) clientId.setValue(shop.discordOAuthClientId);
    const clientSecret = new TextInputBuilder()
      .setCustomId("clientSecret")
      .setLabel("Client Secret")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(clientId),
      new ActionRowBuilder<TextInputBuilder>().addComponents(clientSecret)
    );
    await interaction.showModal(modal);
  },
};

export async function handleShopOAuthModalSubmit(interaction: ModalSubmitInteraction, slug: string) {
  await interaction.deferReply({ ephemeral: true });
  const clientId = interaction.fields.getTextInputValue("clientId").trim();
  const clientSecret = interaction.fields.getTextInputValue("clientSecret").trim();
  if (!clientId || !clientSecret) {
    return interaction.editReply({ embeds: [errorEmbed("Client ID/Secret을 모두 입력해주세요.")] });
  }

  try {
    await applyShopOAuthCredentials(slug, clientId, clientSecret);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return interaction.editReply({ embeds: [errorEmbed(`적용에 실패했습니다: ${message}`)] });
  }

  await interaction.editReply({
    embeds: [
      successEmbed(
        `OAuth 앱이 등록되었습니다. 웹사이트가 재시작되는 동안(약 10~20초) 잠깐 접속이 끊길 수 있습니다.`
      ),
      baseEmbed("📌 디스코드 개발자 포털에 등록해야 할 REDIRECT URI").addFields(
        { name: "일반 로그인용", value: `\`${tenantOAuthRedirectUri(slug)}\`` },
        { name: "관리자 로그인용", value: `\`${tenantAdminOAuthRedirectUri(slug)}\`` },
        {
          name: "등록 방법",
          value:
            "1. https://discord.com/developers/applications 에서 본인 앱 선택\n" +
            "2. 왼쪽 메뉴 **OAuth2** 클릭\n" +
            "3. **Redirect URIs**에 위 2개 URL을 각각 **Add Redirect** 로 추가 후 **Save Changes**\n\n" +
            "두 URI를 모두 등록해야 일반 로그인과 관리자 로그인이 둘 다 정상 동작합니다.",
        }
      ),
    ],
  });
}
