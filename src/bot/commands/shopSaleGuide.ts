import { SlashCommandBuilder, ChannelType } from "discord.js";
import { requireLinkedAdmin } from "@/bot/discordAuth";
import { baseEmbed, errorEmbed, successEmbed } from "@/bot/format";
import type { BotCommand } from "@/bot/types";

function overviewEmbed() {
  return baseEmbed("🏪 자판기(샵) 통째로 구매하기 - ① 개요")
    .setDescription(
      "이 디스코드 샵(자비샵)을 **통째로 복사**해서 내 이름으로 운영할 수 있는 상품입니다.\n" +
        "별도 웹사이트는 없고, **이 봇을 그대로 내 서버에 초대**해서 쓰는 디스코드 전용 서비스입니다 - 상품 구매, 장바구니, 쿠폰, 포인트 충전, 관리자 패널, 이벤트(출석체크/룰렛/친구초대/타임세일), 파트너 기능까지 전부 포함입니다."
    )
    .addFields(
      { name: "💰 가격", value: "월 4,000P\n(매달 자동으로 포인트 차감)", inline: true },
      { name: "🤖 받는 것", value: "전용 샵 코드 + 전용 DB\n(이 봇을 내 서버에 초대해서 사용)", inline: true },
      { name: "🌐 웹사이트", value: "없음 (디스코드 전용)", inline: true },
      {
        name: "📋 전체 순서 요약",
        value:
          "**1.** 상품 목록에서 구매\n**2.** 안내된 샵 코드/비밀키 저장해두기\n**3.** 봇을 내 서버에 초대\n**4.** `/샵연동`으로 연결\n**5.** (선택) 입금 자동승인 앱 설정\n\n아래 안내를 하나씩 따라오시면 됩니다. 궁금한 점은 관리자에게 문의해주세요.",
      }
    );
}

function purchaseStepsEmbed() {
  return baseEmbed("🛒 ② 구매하는 방법 (단계별)").addFields(
    {
      name: "1단계 - 상품 목록 열기",
      value: "메인 패널에서 **🛍️ 구매하기** 버튼을 누르세요.",
    },
    {
      name: "2단계 - 자판기(샵) 상품 찾기",
      value:
        "다른 등급들과 똑같이 목록에 **🏪 자판기(샵) 통째로 구매**가 보입니다. 선택해서 상세 화면으로 들어가세요.",
    },
    {
      name: "3단계 - 구매하기 버튼",
      value:
        "다른 상품과 똑같이 **구매하기** 버튼만 누르면 끝입니다 - 따로 입력하는 창이 없습니다. 샵 코드/이름은 구매자 정보로 자동으로 정해지고, 나중에 관리자 설정에서 이름을 바꿀 수 있습니다.",
    },
    {
      name: "4단계 - 구매 즉시 생성",
      value: "누르는 즉시 4,000P가 차감되고 전용 샵이 바로 만들어집니다. 실패하면 포인트는 그대로 환불됩니다.",
    },
    {
      name: "5단계 - 지급 내용 꼭 저장하기",
      value:
        "지급 내용(또는 DM)에 **샵 코드, 입금 자동승인 웹훅 URL, 비밀키**가 적혀 있습니다. 비밀키는 다시 보여주지 않으니(분실 시 관리자에게 재확인 요청) 스크린샷을 찍어두거나 메모해두세요.",
    }
  );
}

function linkStepsEmbed() {
  return baseEmbed("🔗 ③ 구매 후 내 서버와 연결하기")
    .setDescription("구매만으로는 아직 **내 디스코드 서버**에서 기능이 안 보입니다. 아래 2단계를 마쳐야 합니다.")
    .addFields(
      {
        name: "1단계 - 봇을 내 서버에 초대",
        value:
          "이 봇(지금 이 메시지를 쓰고 있는 봇)의 초대 링크로 **내가 관리자 권한을 가진 내 디스코드 서버**에 초대합니다. 초대 링크는 관리자에게 문의해주세요.",
      },
      {
        name: "2단계 - /샵연동 실행",
        value:
          "봇을 초대한 **그 서버 안에서** `/샵연동 샵코드:내샵코드` 를 입력합니다 (3단계에서 받은 샵 코드).\n\n⚠️ 구매할 때 쓴 디스코드 계정으로 실행해야 합니다 - 다른 사람이 실행하면 \"본인만 연동할 수 있습니다\" 오류가 뜹니다.",
      },
      {
        name: "연동 완료 후",
        value: "그 서버에서 자비샵과 똑같은 명령어/버튼(상품 구매, 장바구니, 쿠폰, 포인트 충전, 관리자 패널 등)을 그대로 쓸 수 있습니다.",
      }
    );
}

function appSetupEmbed() {
  return baseEmbed("💳 ④ 입금 자동승인 앱 설정 (선택사항)")
    .setDescription(
      "포인트 충전 시 입금 확인을 매번 수동으로 안 하고, 은행 알림을 감지해서 자동으로 승인해주는 안드로이드 앱입니다. 필수는 아니고, 켜두면 편합니다."
    )
    .addFields(
      {
        name: "앱 받기",
        value:
          "자비샵 깃허브 저장소의 `android-notifier` 폴더가 앱 소스코드입니다. 본인 PC의 Android Studio로 직접 빌드해서 설치합니다 (자세한 빌드 방법은 그 폴더의 README 참고). 관리자에게 빌드된 apk 공유를 요청해도 됩니다.",
      },
      {
        name: "1단계 - 앱 실행 후 3개 입력",
        value:
          "• **서버 웹훅 URL**: 구매 완료 메시지에 적혀있던 `https://jabishop.krl.kr/api/webhooks/bank-topup/내샵코드` (자비샵 본인 웹서버 주소 + 내 샵 코드 - 별도 웹사이트가 없어도 이 경로 하나로 받습니다)\n• **비밀키**: 역시 구매 완료 메시지에 있던 값 (이 샵 전용이라 다른 샵과 안 겹칩니다)\n• **은행 앱 패키지명**: 기본값 `com.kebhana.hnbank`(하나은행). 다른 은행이면 휴대폰 설정→앱 정보에서 패키지명 확인",
      },
      {
        name: "2단계 - 저장 → 알림 접근 권한 허용",
        value: "저장 버튼 → **알림 접근 권한 설정 열기** 버튼 → 목록에서 이 앱을 찾아 권한 켜기.",
      },
      {
        name: "3단계 - 테스트 전송",
        value: "앱의 **테스트 전송** 버튼을 눌러서 \"서버 연결 성공\"이 뜨는지 확인합니다.",
      },
      {
        name: "4단계 - 배터리 최적화 제외 (중요!)",
        value:
          "설정 → 배터리 → 앱별 배터리 사용 → 이 앱 → **제한 없음**. 이걸 빼먹으면 며칠 뒤 안드로이드가 앱을 꺼버려서 알림을 못 받게 됩니다 (가장 흔한 문제).",
      },
      {
        name: "⚠️ iOS는 지원하지 않습니다",
        value: "애플이 다른 앱의 알림 내용을 읽는 기능 자체를 허용하지 않아서, 이 방식은 아이폰에서는 불가능합니다.",
      }
    );
}

function billingEmbed() {
  return baseEmbed("⚠️ ⑤ 결제 / 해지 정책").addFields(
    { name: "결제 주기", value: "구매일로부터 30일마다 자동으로 4,000P가 차감됩니다.", inline: true },
    { name: "연체 시", value: "결제일에 포인트가 부족하면 **그 즉시** 서비스가 중단됩니다.", inline: true },
    {
      name: "'즉시 중단'이 의미하는 것",
      value:
        "디스코드 서버 연동이 바로 해제되어 봇 기능을 못 씁니다. 다만 데이터(상품/주문/회원 등)는 바로 지워지지 않고 보관되니, 포인트를 채운 뒤 관리자에게 복구를 요청할 수 있습니다.",
    },
    {
      name: "미리 준비하기",
      value: "결제일 전에 미리 포인트를 충전해두시면 서비스 중단 없이 계속 쓰실 수 있습니다.",
    }
  );
}

function faqEmbed() {
  return baseEmbed("❓ ⑥ 자주 묻는 질문 / 문제 해결").addFields(
    {
      name: "/샵연동 했는데 '이미 다른 서버와 연동되어 있습니다'라고 떠요",
      value: "이 샵은 이미 다른 디스코드 서버와 연결이 끝난 상태입니다. 서버를 잘못 입력했는지, 또는 이미 연동을 마쳤는지 확인해주세요.",
    },
    {
      name: "봇 명령어가 내 서버에서 안 보여요",
      value: "슬래시 커맨드가 새 서버에 반영되기까지 최대 1시간 정도 걸릴 수 있습니다. 그래도 안 보이면 관리자에게 문의해주세요.",
    },
    {
      name: "입금 자동승인 앱 테스트가 실패해요",
      value: "웹훅 URL 오타(샵 코드 포함 정확히), 비밀키 불일치가 가장 흔한 원인입니다. 구매 완료 메시지의 값을 다시 복사-붙여넣기 해보세요.",
    },
    {
      name: "비밀키를 잃어버렸어요",
      value: "관리자에게 요청하면 다시 확인해줄 수 있습니다.",
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

    // 임베드 하나에 다 넣기엔 너무 길어서, 단계별로 메시지를 나눠서 순서대로 올린다.
    await channel.send({ embeds: [overviewEmbed()] });
    await channel.send({ embeds: [purchaseStepsEmbed()] });
    await channel.send({ embeds: [linkStepsEmbed()] });
    await channel.send({ embeds: [appSetupEmbed()] });
    await channel.send({ embeds: [billingEmbed()] });
    await channel.send({ embeds: [faqEmbed()] });

    await interaction.editReply({ embeds: [successEmbed(`<#${channel.id}> 채널을 만들고 상세 안내문 6개를 게시했습니다.`)] });
  },
};
