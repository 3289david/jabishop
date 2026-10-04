import { SlashCommandBuilder, ChannelType } from "discord.js";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { baseEmbed, errorEmbed, successEmbed } from "@/bot/format";
import type { BotCommand } from "@/bot/types";

function shopSaleGuideEmbed() {
  return baseEmbed("🏪 자판기(샵) 통째로 구매하기")
    .setDescription(
      "이 디스코드 샵(자비샵)을 통째로 복사해서 내 이름으로 운영할 수 있습니다.\n" +
        "똑같은 웹사이트 + 디스코드 봇 기능이 전부 내 전용 주소/서버에서 돌아갑니다."
    )
    .addFields(
      { name: "💰 가격", value: "월 4,000P (매달 자동 결제)", inline: true },
      { name: "🌐 받는 것", value: "전용 웹사이트 주소 (내가정한이름.krl.kr)", inline: true },
      {
        name: "🛒 구매 방법",
        value: "상품 목록 패널 → **🏪 자판기(샵) 통째로 구매** 버튼 → 원하는 주소/샵 이름 입력",
      },
      {
        name: "🔗 구매 후 할 일",
        value:
          "1) 이 봇을 내 디스코드 서버에 초대한다.\n2) 그 서버에서 `/샵연동 서브도메인:내가정한주소` 입력.\n3) 연동되면 그 서버에서 자비샵과 똑같은 기능(상품 구매/쿠폰/장바구니/관리자 패널 등)을 전부 쓸 수 있습니다.",
      },
      {
        name: "⚠️ 결제 안내",
        value: "매달 자동으로 4,000P가 차감됩니다. 포인트가 부족하면 **그 즉시 서비스가 중단**됩니다 (주소/서버 모두 내려감).",
      }
    );
}

export const shopSaleGuideChannelCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("자판기안내채널")
    .setDescription("[관리자] 자판기(샵) 통째로 구매하는 방법을 안내하는 채널을 새로 만듭니다.")
    .addStringOption((o) => o.setName("채널이름").setDescription("기본값: 🏪ㅣ자판기-이용안내").setRequired(false)),
  async execute(interaction) {
    await requireLinkedAdmin(interaction.user.id);
    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    if (!guild) return interaction.editReply({ embeds: [errorEmbed("서버 안에서만 사용할 수 있습니다.")] });

    const channelName = interaction.options.getString("채널이름")?.trim() || "🏪ㅣ자판기-이용안내";
    const channel = await guild.channels
      .create({ name: channelName, type: ChannelType.GuildText })
      .catch(() => null);
    if (!channel) return interaction.editReply({ embeds: [errorEmbed("채널 생성에 실패했습니다 (권한을 확인해주세요).")] });

    await channel.send({ embeds: [shopSaleGuideEmbed()] });

    await interaction.editReply({ embeds: [successEmbed(`<#${channel.id}> 채널을 만들고 안내문을 게시했습니다.`)] });
  },
};
