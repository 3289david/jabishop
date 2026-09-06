import { AttachmentBuilder, type ButtonInteraction } from "discord.js";
import { prisma } from "@/lib/prisma";
import { purchaseTier, OrderError } from "@/lib/orders";
import { confirmTopUp, rejectTopUp, TopUpError } from "@/lib/points";
import { approveRefund, rejectRefund, RefundError } from "@/lib/refunds";
import { assertActiveShopUser, requireLinkedAdmin } from "@/bot/discordAuth";
import { readUploadedFile } from "@/bot/fileStorage";
import { errorEmbed, successEmbed, pt } from "@/bot/format";
import { showTopUpModal, showInquiryModal, showAnswerModal } from "@/bot/interactions/modals";
import {
  productSelectRow,
  tierDetailPayload,
  pointsPayload,
  cartPayload,
  ordersPayload,
  couponsPayload,
  pendingTopUpsPayload,
  pendingRefundsPayload,
  pendingInquiriesPayload,
  tierListPayload,
} from "@/bot/panels";

async function handlePanelProducts(interaction: ButtonInteraction) {
  const { embed, row } = await productSelectRow();
  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function handlePanelPoints(interaction: ButtonInteraction) {
  const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
  const txs = await prisma.pointTransaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5 });
  const { embed, row } = pointsPayload(user, txs);
  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function handlePanelCart(interaction: ButtonInteraction) {
  const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
  const items = await prisma.cartItem.findMany({ where: { userId: user.id }, include: { tier: true } });
  const { embed, row } = cartPayload(items, items.length > 0);
  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function handlePanelOrders(interaction: ButtonInteraction) {
  const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { tier: true, artwork: true },
  });
  const { embed } = ordersPayload(orders);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handlePanelCoupons(interaction: ButtonInteraction) {
  const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
  const userCoupons = await prisma.userCoupon.findMany({ where: { userId: user.id }, include: { coupon: true }, orderBy: { issuedAt: "desc" } });
  const { embed } = couponsPayload(userCoupons);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleBuy(interaction: ButtonInteraction, slug: string) {
  await interaction.deferUpdate();
  try {
    const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
    const tier = await prisma.tier.findUnique({ where: { slug } });
    if (!tier) throw new OrderError("TIER_NOT_FOUND", "존재하지 않는 등급입니다.");

    const order = await purchaseTier({ userId: user.id, tierId: tier.id });
    const artwork = order.artwork;

    const embed = successEmbed(`${tier.name} 구매 완료!`)
      .setTitle(`주문 #${order.orderNo}`)
      .addFields({ name: "결제 금액", value: pt(order.finalAmount), inline: true }, { name: "지급된 그림", value: artwork?.title ?? "-", inline: true });

    const files = [];
    if (artwork) {
      try {
        const buffer = await readUploadedFile(artwork.fileKey);
        const ext = artwork.fileKey.split(".").pop() || "png";
        files.push(new AttachmentBuilder(buffer, { name: `${artwork.code}.${ext}` }));
        embed.setImage(`attachment://${artwork.code}.${ext}`);
      } catch {
        // 파일 누락 시 이미지 없이 결과만 표시
      }
    }
    await interaction.editReply({ embeds: [embed], components: [], files });
  } catch (e) {
    const message = e instanceof OrderError || e instanceof Error ? e.message : "구매 중 오류가 발생했습니다.";
    await interaction.editReply({ embeds: [errorEmbed(message)], components: [] });
  }
}

async function handleCartAdd(interaction: ButtonInteraction, slug: string) {
  const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
  const tier = await prisma.tier.findUnique({ where: { slug } });
  if (!tier) return interaction.reply({ embeds: [errorEmbed("존재하지 않는 등급입니다.")], ephemeral: true });

  await prisma.cartItem.upsert({
    where: { userId_tierId: { userId: user.id, tierId: tier.id } },
    update: { quantity: { increment: 1 } },
    create: { userId: user.id, tierId: tier.id, quantity: 1 },
  });
  await interaction.reply({ embeds: [successEmbed(`${tier.name}을(를) 장바구니에 담았습니다.`)], ephemeral: true });
}

async function handleCartCheckout(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const user = await assertActiveShopUser(interaction.user.id, interaction.user.tag);
  const items = await prisma.cartItem.findMany({ where: { userId: user.id }, include: { tier: true } });
  if (items.length === 0) return interaction.editReply({ embeds: [errorEmbed("장바구니가 비어 있습니다.")], components: [] });

  let successCount = 0;
  let firstError: string | null = null;
  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      try {
        await purchaseTier({ userId: user.id, tierId: item.tierId });
        successCount++;
        await prisma.cartItem.update({ where: { id: item.id }, data: { quantity: { decrement: 1 } } }).catch(() => {});
      } catch (e) {
        firstError = `${item.tier.name}: ${e instanceof OrderError ? e.message : "구매 중 오류"}`;
        break;
      }
    }
    if (firstError) break;
  }
  await prisma.cartItem.deleteMany({ where: { userId: user.id, quantity: { lte: 0 } } });

  const embed = firstError
    ? errorEmbed(successCount > 0 ? `${successCount}건 완료 후 중단 - ${firstError}` : firstError)
    : successEmbed(`${successCount}건 결제가 완료되었습니다. 그림은 DM 또는 /주문내역에서 확인하세요.`);
  await interaction.editReply({ embeds: [embed], components: [] });
}

async function handleAdminSection(interaction: ButtonInteraction, section: string) {
  await requireLinkedAdmin(interaction.user.id);
  await interaction.deferUpdate();

  if (section === "topups") {
    const { embed, rows } = await pendingTopUpsPayload();
    return interaction.editReply({ embeds: [embed], components: rows });
  }
  if (section === "refunds") {
    const { embed, rows } = await pendingRefundsPayload();
    return interaction.editReply({ embeds: [embed], components: rows });
  }
  if (section === "inquiries") {
    const { embed, rows } = await pendingInquiriesPayload();
    return interaction.editReply({ embeds: [embed], components: rows });
  }
  if (section === "tiers") {
    const { embed } = await tierListPayload();
    return interaction.editReply({ embeds: [embed], components: [] });
  }
  if (section === "stats") {
    const { statsEmbed } = await import("@/bot/commands/adminStats");
    const embed = await statsEmbed();
    return interaction.editReply({ embeds: [embed], components: [] });
  }
}

async function handleTopUpAction(interaction: ButtonInteraction, action: "approve" | "reject", id: string) {
  const admin = await requireLinkedAdmin(interaction.user.id);
  try {
    if (action === "approve") await confirmTopUp(id, admin.id);
    else await rejectTopUp(id, admin.id);
  } catch (e) {
    return interaction.reply({ embeds: [errorEmbed(e instanceof TopUpError ? e.message : "처리 중 오류")], ephemeral: true });
  }
  await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: `TOPUP_${action.toUpperCase()}`, target: id } });
  await interaction.reply({ embeds: [successEmbed(action === "approve" ? "충전을 승인했습니다." : "충전 신청을 거절했습니다.")], ephemeral: true });
}

async function handleRefundAction(interaction: ButtonInteraction, action: "approve" | "reject", id: string) {
  const admin = await requireLinkedAdmin(interaction.user.id);
  try {
    if (action === "approve") await approveRefund(id, admin.id);
    else await rejectRefund(id, admin.id);
  } catch (e) {
    return interaction.reply({ embeds: [errorEmbed(e instanceof RefundError ? e.message : "처리 중 오류")], ephemeral: true });
  }
  await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: `REFUND_${action.toUpperCase()}`, target: id } });
  await interaction.reply({ embeds: [successEmbed(action === "approve" ? "환불을 승인했습니다." : "환불 요청을 거절했습니다.")], ephemeral: true });
}

export async function handleButtonInteraction(interaction: ButtonInteraction) {
  const [ns, a, b] = interaction.customId.split(":");

  if (ns === "panel") {
    if (a === "products") return handlePanelProducts(interaction);
    if (a === "points") return handlePanelPoints(interaction);
    if (a === "cart") return handlePanelCart(interaction);
    if (a === "orders") return handlePanelOrders(interaction);
    if (a === "coupons") return handlePanelCoupons(interaction);
    if (a === "inquiry") return showInquiryModal(interaction);
    return;
  }
  if (ns === "buy") return handleBuy(interaction, a);
  if (ns === "cartadd") return handleCartAdd(interaction, a);
  if (ns === "cart" && a === "checkout") return handleCartCheckout(interaction);
  if (ns === "modal" && a === "topup") return showTopUpModal(interaction);
  if (ns === "admin") return handleAdminSection(interaction, a);
  if (ns === "topup") return handleTopUpAction(interaction, a as "approve" | "reject", b);
  if (ns === "refund") return handleRefundAction(interaction, a as "approve" | "reject", b);
  if (ns === "inquiry" && a === "answer") return showAnswerModal(interaction, b);
}
