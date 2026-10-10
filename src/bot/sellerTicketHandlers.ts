import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { prisma } from "@/lib/prisma";
import { panelError, panelSuccess, ephemeral } from "@/bot/ui";
import {
  openSellerTicket,
  setSellerTicketStatus,
  closeSellerTicket,
  createSellerReview,
  fileSellerReport,
  SellerError,
} from "@/lib/sellers";
import { sellerTicketOpenPayload, sellerReviewPromptPayload } from "@/bot/sellerPanels";
import { sendChannelMessage } from "@/lib/discordNotify";
import { SELLER_TICKET_STATUS } from "@/lib/constants";

export const SELLER_REPORT_MODAL_PREFIX = "seller_report_modal:";

/** 상품 임베드의 "🛒 구매 문의" 버튼 - 비공개 티켓 채널을 만든다. */
export async function handleSellerBuyInquiry(interaction: ButtonInteraction, productId: string) {
  await interaction.deferReply({ ephemeral: true });
  const product = await prisma.sellerProduct.findUnique({ where: { id: productId } });
  if (!product) return interaction.editReply(panelError("존재하지 않는 상품입니다."));
  if (!interaction.guildId) return interaction.editReply(panelError("서버 안에서만 사용할 수 있습니다."));

  try {
    const ticket = await openSellerTicket({
      sellerId: product.sellerId,
      productId: product.id,
      buyerDiscordId: interaction.user.id,
      buyerTag: interaction.user.tag,
      guildId: interaction.guildId,
    });
    const seller = await prisma.seller.findUnique({ where: { id: product.sellerId } });
    if (!seller) throw new SellerError("존재하지 않는 판매자입니다.");

    if (ticket.channelId) {
      const payload = sellerTicketOpenPayload(seller, product, interaction.user.tag, ticket.id);
      await sendChannelMessage(ticket.channelId, { flags: payload.flags, components: payload.components.map((c) => c.toJSON()) });
    }
    await interaction.editReply(
      panelSuccess(ticket.channelId ? `구매 문의 채널이 열렸습니다: <#${ticket.channelId}>` : "문의 채널 생성에 실패했습니다. 관리자에게 문의해주세요.")
    );
  } catch (e) {
    const message = e instanceof SellerError ? e.message : "처리 중 오류가 발생했습니다.";
    await interaction.editReply(panelError(message));
  }
}

async function requireTicketParty(ticketId: string, discordUserId: string) {
  const ticket = await prisma.sellerTicket.findUnique({ where: { id: ticketId }, include: { seller: true } });
  if (!ticket) throw new SellerError("존재하지 않는 티켓입니다.");
  if (ticket.buyerDiscordId !== discordUserId && ticket.seller.discordUserId !== discordUserId) {
    throw new SellerError("이 거래의 구매자/판매자만 사용할 수 있습니다.");
  }
  return ticket;
}

/** 결제완료/상품전달/거래취소/티켓닫기 버튼 공용 처리. */
export async function handleSellerTicketAction(interaction: ButtonInteraction, action: string, ticketId: string) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const ticket = await requireTicketParty(ticketId, interaction.user.id);

    if (action === "paid") {
      await setSellerTicketStatus(ticketId, SELLER_TICKET_STATUS.PAID);
      return interaction.editReply(panelSuccess("결제 완료로 표시했습니다."));
    }
    if (action === "delivered") {
      await setSellerTicketStatus(ticketId, SELLER_TICKET_STATUS.DELIVERED);
      return interaction.editReply(panelSuccess("상품 전달 완료로 표시했습니다."));
    }
    if (action === "complete") {
      await setSellerTicketStatus(ticketId, SELLER_TICKET_STATUS.COMPLETED);
      if (ticket.channelId) {
        const payload = sellerReviewPromptPayload(ticketId);
        await sendChannelMessage(ticket.channelId, { flags: payload.flags, components: payload.components.map((c) => c.toJSON()) });
      }
      return interaction.editReply(panelSuccess("거래 완료로 표시했습니다. 구매자 후기 요청을 채널에 올렸습니다."));
    }
    if (action === "cancel") {
      await setSellerTicketStatus(ticketId, SELLER_TICKET_STATUS.CANCELLED);
      return interaction.editReply(panelSuccess("거래를 취소로 표시했습니다."));
    }
    if (action === "close") {
      await closeSellerTicket(ticketId);
      return interaction.editReply(panelSuccess("티켓을 닫았습니다. 잠시 후 채널이 삭제됩니다."));
    }
  } catch (e) {
    const message = e instanceof SellerError ? e.message : "처리 중 오류가 발생했습니다.";
    await interaction.editReply(panelError(message));
  }
}

export async function showSellerReportModal(interaction: ButtonInteraction, ticketId: string) {
  const ticket = await prisma.sellerTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return interaction.reply(ephemeral(panelError("존재하지 않는 티켓입니다.")));

  const modal = new ModalBuilder().setCustomId(`${SELLER_REPORT_MODAL_PREFIX}${ticket.sellerId}`).setTitle("판매자 신고");
  const reason = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("신고 사유 (사기/상품 미제공/허위 상품/가격 문제/욕설·비매너/규정 위반/기타)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  const detail = new TextInputBuilder()
    .setCustomId("detail")
    .setLabel("상세 설명")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(reason),
    new ActionRowBuilder<TextInputBuilder>().addComponents(detail)
  );
  await interaction.showModal(modal);
}

export async function handleSellerReportModalSubmit(interaction: ModalSubmitInteraction, sellerId: string) {
  await interaction.deferReply({ ephemeral: true });
  const reason = interaction.fields.getTextInputValue("reason").trim();
  const detail = interaction.fields.getTextInputValue("detail").trim() || undefined;

  try {
    await fileSellerReport({ sellerId, reporterDiscordId: interaction.user.id, reason, detail });
    await interaction.editReply(panelSuccess("신고가 접수되었습니다. 관리자가 확인 후 조치합니다."));
  } catch (e) {
    await interaction.editReply(panelError(e instanceof SellerError ? e.message : "처리 중 오류가 발생했습니다."));
  }
}

/** 거래완료 후 구매자가 누른 별점 버튼. */
export async function handleSellerReviewButton(interaction: ButtonInteraction, rating: string, ticketId: string) {
  await interaction.deferUpdate();
  try {
    const review = await createSellerReview(ticketId, interaction.user.id, Number(rating));
    // V2 패널은 버튼도 같은 컨테이너 안에 있어서, 별점 버튼이 없는 새 패널로 통째로
    // 교체하는 것 자체가 곧 "버튼 제거"다 (기존 embeds+components:[] 패턴과 동일한 효과).
    await interaction.editReply(panelSuccess(`⭐ ${review.rating}점 후기가 등록되었습니다. 감사합니다!`));
  } catch (e) {
    const message = e instanceof SellerError ? e.message : "처리 중 오류가 발생했습니다.";
    await interaction.followUp(ephemeral(panelError(message)));
  }
}
