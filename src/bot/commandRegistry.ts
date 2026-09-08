import type { BotCommand } from "@/bot/types";
import { productListCommand, productDetailCommand } from "@/bot/commands/products";
import { purchaseCommand } from "@/bot/commands/purchase";
import { cartAddCommand, cartViewCommand, cartRemoveCommand, cartCheckoutCommand } from "@/bot/commands/cart";
import { orderListCommand, orderDetailCommand } from "@/bot/commands/orders";
import { pointsCommand, topUpCommand } from "@/bot/commands/points";
import { couponListCommand } from "@/bot/commands/coupons";
import { reviewCreateCommand } from "@/bot/commands/reviews";
import { inquiryCreateCommand, inquiryListCommand } from "@/bot/commands/inquiries";
import { reportCreateCommand } from "@/bot/commands/reports";
import { notificationsCommand } from "@/bot/commands/notifications";
import { refundRequestCommand } from "@/bot/commands/refunds";
import { exchangeRequestCommand } from "@/bot/commands/exchanges";
import { adminLinkCommand } from "@/bot/commands/adminLink";
import { adminUnlinkCommand } from "@/bot/commands/adminUnlink";
import { tierListCommand, tierCreateCommand, tierUpdateCommand, tierDeleteCommand } from "@/bot/commands/adminProducts";
import {
  artworkCreateCommand,
  artworkListCommand,
  artworkStatusCommand,
  artworkDeleteCommand,
  artworkGrantCommand,
} from "@/bot/commands/adminInventory";
import { topUpListCommand, topUpConfirmCommand, topUpRejectCommand } from "@/bot/commands/adminPayments";
import { refundListCommand, refundApproveCommand, refundRejectCommand } from "@/bot/commands/adminRefunds";
import { exchangeListCommand, exchangeApproveCommand, exchangeRejectCommand } from "@/bot/commands/adminExchanges";
import { couponCreateCommand, couponListAdminCommand, couponIssueCommand } from "@/bot/commands/adminCoupons";
import { inquiryListAdminCommand, inquiryAnswerCommand } from "@/bot/commands/adminInquiries";
import { reportListAdminCommand, reportResolveCommand } from "@/bot/commands/adminReports";
import { broadcastCommand } from "@/bot/commands/adminNotify";
import { statsCommand } from "@/bot/commands/adminStats";
import { settingsViewCommand, settingsUpdateCommand, purgeSeedDataCommand } from "@/bot/commands/adminSettings";
import { memberViewCommand, memberStatusCommand, memberPointAdjustCommand } from "@/bot/commands/adminMembers";
import { loginLogsCommand, activityLogsCommand } from "@/bot/commands/adminSecurity";
import { panelCommand } from "@/bot/commands/panel";
import { adminPanelCommand } from "@/bot/commands/adminPanel";

export const commands: BotCommand[] = [
  // 패널 (버튼 UI)
  panelCommand,
  adminPanelCommand,
  // 사용자 기능
  productListCommand,
  productDetailCommand,
  purchaseCommand,
  cartAddCommand,
  cartViewCommand,
  cartRemoveCommand,
  cartCheckoutCommand,
  orderListCommand,
  orderDetailCommand,
  pointsCommand,
  topUpCommand,
  couponListCommand,
  reviewCreateCommand,
  inquiryCreateCommand,
  inquiryListCommand,
  reportCreateCommand,
  notificationsCommand,
  refundRequestCommand,
  exchangeRequestCommand,
  // 관리자 연동
  adminLinkCommand,
  adminUnlinkCommand,
  // 관리자 기능
  tierListCommand,
  tierCreateCommand,
  tierUpdateCommand,
  tierDeleteCommand,
  artworkCreateCommand,
  artworkListCommand,
  artworkStatusCommand,
  artworkDeleteCommand,
  artworkGrantCommand,
  topUpListCommand,
  topUpConfirmCommand,
  topUpRejectCommand,
  refundListCommand,
  refundApproveCommand,
  refundRejectCommand,
  exchangeListCommand,
  exchangeApproveCommand,
  exchangeRejectCommand,
  couponCreateCommand,
  couponListAdminCommand,
  couponIssueCommand,
  inquiryListAdminCommand,
  inquiryAnswerCommand,
  reportListAdminCommand,
  reportResolveCommand,
  broadcastCommand,
  statsCommand,
  settingsViewCommand,
  settingsUpdateCommand,
  purgeSeedDataCommand,
  memberViewCommand,
  memberStatusCommand,
  memberPointAdjustCommand,
  loginLogsCommand,
  activityLogsCommand,
];

export const commandsByName = new Map(commands.map((c) => [c.data.name, c]));
