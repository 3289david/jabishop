import { SlashCommandBuilder, ChannelType } from "discord.js";
import { prisma } from "@/lib/prisma";
import { requireLinkedAdmin, requireSuperRole } from "@/bot/discordAuth";
import { buildPanel, panelError, panelSuccess, ephemeral } from "@/bot/ui";
import { purgeSeedData } from "@/lib/adminMaintenance";
import type { BotCommand } from "@/bot/types";

export const settingsViewCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("설정보기").setDescription("[관리자] 현재 쇼핑몰 설정을 봅니다."),
  async execute(interaction) {
    await requireLinkedAdmin(interaction.user.id);
    const s = await prisma.shopSetting.findUnique({ where: { id: "singleton" } });
    const fields = [
      { name: "쇼핑몰 이름", value: s?.shopName ?? "-" },
      { name: "인증 역할", value: s?.verifyRoleId ? `<@&${s.verifyRoleId}>` : "미설정" },
      { name: "입금 계좌", value: `${s?.bankName ?? "-"} ${s?.bankAccountNumber ?? ""} (${s?.bankAccountHolder ?? "-"})` },
      { name: "다운로드 후 환불", value: s?.refundAllowedAfterDownload ? "허용" : "불허" },
      { name: "안내 문구", value: s?.noticeMessage ?? "-" },
      { name: "구매 로그 채널", value: s?.discordPurchaseLogChannelId ? `<#${s.discordPurchaseLogChannelId}>` : "미설정" },
      {
        name: "자동삭제 채팅 채널",
        value: s?.discordAutoDeleteChannelId ? `<#${s.discordAutoDeleteChannelId}> (5초 후 자동 삭제)` : "미설정",
      },
      {
        name: "누적 구매금액 등급 역할",
        value: [
          `150,000원↑(10%): ${s?.discordRoleTier150k ? `<@&${s.discordRoleTier150k}>` : "미설정"}`,
          `100,000원↑(8%): ${s?.discordRoleTier100k ? `<@&${s.discordRoleTier100k}>` : "미설정"}`,
          `50,000원↑(5%): ${s?.discordRoleTier50k ? `<@&${s.discordRoleTier50k}>` : "미설정"}`,
          `10,000원↑: ${s?.discordRoleTier10k ? `<@&${s.discordRoleTier10k}>` : "미설정"}`,
          `구매자: ${s?.discordRoleBuyer ? `<@&${s.discordRoleBuyer}>` : "미설정"}`,
        ].join("\n"),
      },
      {
        name: "파트너 설정",
        value: [
          `카테고리: ${s?.partnerCategoryId ? `<#${s.partnerCategoryId}>` : "미설정"}`,
          `역할: ${s?.partnerRoleId ? `<@&${s.partnerRoleId}>` : "미설정"}`,
          `일일 발송 문구: ${s?.partnerDailyMessage ?? "미설정"}`,
        ].join("\n"),
      },
      {
        name: "일일 통계 공지",
        value: `채널: ${s?.announcementChannelId ? `<#${s.announcementChannelId}>` : "미설정"} (매일 1회 오늘 매출/주문/재고/회원/환불/문의 자동 게시)`,
      },
      {
        name: "공개 통계 패널",
        value: `채널: ${s?.publicStatsChannelId ? `<#${s.publicStatsChannelId}>` : "미설정"} (5분마다 자동 갱신, 최고관리자 구매는 매출 집계에서 자동 제외)`,
      },
      {
        name: "구매 축하 쿠폰 추첨",
        value: `${s?.purchaseCouponDropEnabled ? "🟢 켜짐" : "⚪ 꺼짐"} (100원 이상 상품 구매 완료 시 5% 확률로 5% 할인 쿠폰 지급)`,
      },
      {
        name: "이벤트 기능",
        value: [
          `출석체크: ${s?.checkInEventEnabled ? "🟢 켜짐" : "⚪ 꺼짐"}`,
          `타임세일: ${s?.flashSaleEventEnabled ? "🟢 켜짐" : "⚪ 꺼짐"}`,
          `친구 초대: ${s?.referralEventEnabled ? "🟢 켜짐" : "⚪ 꺼짐"}`,
          `룰렛/뽑기: ${s?.gachaEventEnabled ? "🟢 켜짐" : "⚪ 꺼짐"} (1회 ${s?.gachaCostPoints ?? 100}P)`,
          `1+1: ${s?.buyOneGetOneEventEnabled ? "🟢 켜짐" : "⚪ 꺼짐"} (등급별 적용은 /등급수정 1+1적용)`,
        ].join("\n"),
      },
    ];
    await interaction.reply(ephemeral(buildPanel({ title: "⚙️ 쇼핑몰 설정", fields })));
  },
};

export const settingsUpdateCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("설정수정")
    .setDescription("[관리자/SUPER] 쇼핑몰 설정을 수정합니다.")
    .addStringOption((o) => o.setName("샵이름").setDescription("쇼핑몰 이름 (웹사이트/봇 메시지 등에 표시됨)"))
    .addRoleOption((o) => o.setName("인증역할").setDescription("인증 패널에서 '인증하기' 버튼을 누르면 지급할 역할"))
    .addStringOption((o) => o.setName("은행명").setDescription("입금 은행명"))
    .addStringOption((o) => o.setName("계좌번호").setDescription("입금 계좌번호"))
    .addStringOption((o) => o.setName("예금주").setDescription("예금주명"))
    .addBooleanOption((o) => o.setName("다운로드후환불허용").setDescription("다운로드한 상품도 환불 허용할지"))
    .addStringOption((o) => o.setName("안내문구").setDescription("사용자에게 보여줄 안내 문구"))
    .addChannelOption((o) =>
      o.setName("구매로그채널").setDescription("구매 발생 시 공지할 채널").addChannelTypes(ChannelType.GuildText)
    )
    .addChannelOption((o) =>
      o
        .setName("자동삭제채팅채널")
        .setDescription("이 채널의 모든 메시지를 5초 후 자동 삭제")
        .addChannelTypes(ChannelType.GuildText)
    )
    .addRoleOption((o) => o.setName("역할150k").setDescription("누적 150,000원 이상 (10% 할인) 역할"))
    .addRoleOption((o) => o.setName("역할100k").setDescription("누적 100,000원 이상 (8% 할인) 역할"))
    .addRoleOption((o) => o.setName("역할50k").setDescription("누적 50,000원 이상 (5% 할인) 역할"))
    .addRoleOption((o) => o.setName("역할10k").setDescription("누적 10,000원 이상 (표시 전용) 역할"))
    .addRoleOption((o) => o.setName("역할구매자").setDescription("1원 이상 구매자 전원에게 줄 역할"))
    .addChannelOption((o) =>
      o.setName("파트너카테고리").setDescription("파트너 승인 시 채널을 생성할 카테고리").addChannelTypes(ChannelType.GuildCategory)
    )
    .addRoleOption((o) => o.setName("파트너역할").setDescription("파트너 승인 시 지급할 역할"))
    .addStringOption((o) => o.setName("파트너일일문구").setDescription("매일 1회 파트너 웹훅으로 보낼 문구"))
    .addChannelOption((o) =>
      o
        .setName("공지채널")
        .setDescription("매일 1회 오늘 매출/주문/재고/회원/환불/문의 통계를 자동 게시할 채널")
        .addChannelTypes(ChannelType.GuildText)
    )
    .addBooleanOption((o) =>
      o.setName("구매쿠폰추첨").setDescription("켜면 구매 완료 시마다 5% 확률로 5% 할인 쿠폰을 자동 지급")
    )
    .addBooleanOption((o) => o.setName("출석체크이벤트").setDescription("켜면 /출석체크로 하루 1회 포인트 지급"))
    .addBooleanOption((o) =>
      o.setName("타임세일이벤트").setDescription("켜면 /타임세일생성으로 만든 타임세일이 실제로 적용됨")
    )
    .addBooleanOption((o) => o.setName("친구초대이벤트").setDescription("켜면 /초대코드등록·첫 구매 보상 지급이 작동"))
    .addBooleanOption((o) => o.setName("룰렛이벤트").setDescription("켜면 /룰렛돌리기 사용 가능"))
    .addIntegerOption((o) => o.setName("룰렛비용").setDescription("룰렛 1회 참가 비용 (포인트, 기본 100)").setMinValue(1))
    .addBooleanOption((o) =>
      o.setName("원플러스원이벤트").setDescription("전역 스위치 - 켜면 /등급수정에서 원플러스원적용된 등급들이 실제로 동작함")
    ),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    requireSuperRole(admin.role);

    const shopName = interaction.options.getString("샵이름");
    const verifyRole = interaction.options.getRole("인증역할");
    const bankName = interaction.options.getString("은행명");
    const bankAccountNumber = interaction.options.getString("계좌번호");
    const bankAccountHolder = interaction.options.getString("예금주");
    const refundAllowedAfterDownload = interaction.options.getBoolean("다운로드후환불허용");
    const noticeMessage = interaction.options.getString("안내문구");
    const purchaseLogChannel = interaction.options.getChannel("구매로그채널");
    const autoDeleteChannel = interaction.options.getChannel("자동삭제채팅채널");
    const roleTier150k = interaction.options.getRole("역할150k");
    const roleTier100k = interaction.options.getRole("역할100k");
    const roleTier50k = interaction.options.getRole("역할50k");
    const roleTier10k = interaction.options.getRole("역할10k");
    const roleBuyer = interaction.options.getRole("역할구매자");
    const partnerCategory = interaction.options.getChannel("파트너카테고리");
    const partnerRole = interaction.options.getRole("파트너역할");
    const partnerDailyMessage = interaction.options.getString("파트너일일문구");
    const announcementChannel = interaction.options.getChannel("공지채널");
    const purchaseCouponDropEnabled = interaction.options.getBoolean("구매쿠폰추첨");
    const checkInEventEnabled = interaction.options.getBoolean("출석체크이벤트");
    const flashSaleEventEnabled = interaction.options.getBoolean("타임세일이벤트");
    const referralEventEnabled = interaction.options.getBoolean("친구초대이벤트");
    const gachaEventEnabled = interaction.options.getBoolean("룰렛이벤트");
    const gachaCostPoints = interaction.options.getInteger("룰렛비용");
    const buyOneGetOneEventEnabled = interaction.options.getBoolean("원플러스원이벤트");

    await prisma.shopSetting.upsert({
      where: { id: "singleton" },
      update: {
        ...(shopName != null ? { shopName } : {}),
        ...(verifyRole ? { verifyRoleId: verifyRole.id } : {}),
        ...(bankName != null ? { bankName } : {}),
        ...(bankAccountNumber != null ? { bankAccountNumber } : {}),
        ...(bankAccountHolder != null ? { bankAccountHolder } : {}),
        ...(refundAllowedAfterDownload != null ? { refundAllowedAfterDownload } : {}),
        ...(noticeMessage != null ? { noticeMessage } : {}),
        ...(purchaseLogChannel ? { discordPurchaseLogChannelId: purchaseLogChannel.id } : {}),
        ...(autoDeleteChannel ? { discordAutoDeleteChannelId: autoDeleteChannel.id } : {}),
        ...(roleTier150k ? { discordRoleTier150k: roleTier150k.id } : {}),
        ...(roleTier100k ? { discordRoleTier100k: roleTier100k.id } : {}),
        ...(roleTier50k ? { discordRoleTier50k: roleTier50k.id } : {}),
        ...(roleTier10k ? { discordRoleTier10k: roleTier10k.id } : {}),
        ...(roleBuyer ? { discordRoleBuyer: roleBuyer.id } : {}),
        ...(partnerCategory ? { partnerCategoryId: partnerCategory.id } : {}),
        ...(partnerRole ? { partnerRoleId: partnerRole.id } : {}),
        ...(partnerDailyMessage != null ? { partnerDailyMessage } : {}),
        ...(announcementChannel ? { announcementChannelId: announcementChannel.id } : {}),
        ...(purchaseCouponDropEnabled != null ? { purchaseCouponDropEnabled } : {}),
        ...(checkInEventEnabled != null ? { checkInEventEnabled } : {}),
        ...(flashSaleEventEnabled != null ? { flashSaleEventEnabled } : {}),
        ...(referralEventEnabled != null ? { referralEventEnabled } : {}),
        ...(gachaEventEnabled != null ? { gachaEventEnabled } : {}),
        ...(gachaCostPoints != null ? { gachaCostPoints } : {}),
        ...(buyOneGetOneEventEnabled != null ? { buyOneGetOneEventEnabled } : {}),
      },
      create: {
        id: "singleton",
        ...(shopName != null ? { shopName } : {}),
        ...(verifyRole ? { verifyRoleId: verifyRole.id } : {}),
        bankName: bankName ?? "",
        bankAccountNumber: bankAccountNumber ?? "",
        bankAccountHolder: bankAccountHolder ?? "",
        refundAllowedAfterDownload: refundAllowedAfterDownload ?? false,
        noticeMessage,
        discordPurchaseLogChannelId: purchaseLogChannel?.id,
        discordAutoDeleteChannelId: autoDeleteChannel?.id,
        discordRoleTier150k: roleTier150k?.id,
        discordRoleTier100k: roleTier100k?.id,
        discordRoleTier50k: roleTier50k?.id,
        discordRoleTier10k: roleTier10k?.id,
        discordRoleBuyer: roleBuyer?.id,
        partnerCategoryId: partnerCategory?.id,
        partnerRoleId: partnerRole?.id,
        partnerDailyMessage,
        announcementChannelId: announcementChannel?.id,
        purchaseCouponDropEnabled: purchaseCouponDropEnabled ?? false,
        checkInEventEnabled: checkInEventEnabled ?? false,
        flashSaleEventEnabled: flashSaleEventEnabled ?? false,
        referralEventEnabled: referralEventEnabled ?? false,
        gachaEventEnabled: gachaEventEnabled ?? false,
        ...(gachaCostPoints != null ? { gachaCostPoints } : {}),
        buyOneGetOneEventEnabled: buyOneGetOneEventEnabled ?? false,
      },
    });
    await prisma.adminActivityLog.create({ data: { adminId: admin.id, action: "SETTINGS_UPDATE" } });
    await interaction.reply(ephemeral(panelSuccess("설정이 저장되었습니다.")));
  },
};

export const purgeSeedDataCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("데모데이터삭제")
    .setDescription("[관리자/SUPER] 시드 스크립트가 만든 테스트 회원/계정을 전부 삭제합니다.")
    .addStringOption((o) => o.setName("확인").setDescription('정말 삭제하려면 "삭제"를 입력하세요').setRequired(true)),
  async execute(interaction) {
    const admin = await requireLinkedAdmin(interaction.user.id);
    requireSuperRole(admin.role);
    const confirm = interaction.options.getString("확인", true);
    if (confirm !== "삭제") {
      return interaction.reply(ephemeral(panelError('확인 문구가 일치하지 않습니다. "삭제"를 정확히 입력해주세요.')));
    }

    await interaction.deferReply({ ephemeral: true });
    const result = await purgeSeedData();
    await prisma.adminActivityLog.create({
      data: {
        adminId: admin.id,
        action: "PURGE_SEED_DATA",
        detail: `회원 ${result.deletedUsers}명, 주문 ${result.deletedOrders}건, 계정 ${result.deletedArtworks}개 삭제`,
      },
    });
    await interaction.editReply(
      panelSuccess(`데모 데이터 삭제 완료: 회원 ${result.deletedUsers}명, 주문 ${result.deletedOrders}건, 계정 ${result.deletedArtworks}개`)
    );
  },
};
