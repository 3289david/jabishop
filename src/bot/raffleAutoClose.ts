import type { Client } from "discord.js";
import { prisma } from "@/lib/prisma";
import { RAFFLE_STATUS } from "@/lib/constants";
import { drawRaffleWinners, RaffleError } from "@/lib/raffles";
import { announceRaffleResult } from "@/bot/raffleAnnounce";

// 관리자가 이벤트 생성 시 "마감시간분"을 지정한 경우, 그 시각이 지나면 여기서 자동으로
// 마감 + 추첨 + 공지까지 처리한다. 1분마다 마감 시각이 지난 OPEN 이벤트가 있는지 확인한다.
const CHECK_INTERVAL_MS = 60 * 1000;

export async function checkAutoCloseRaffles(client: Client) {
  const due = await prisma.raffleEvent.findMany({
    where: { status: RAFFLE_STATUS.OPEN, closesAt: { lte: new Date() } },
  });

  for (const raffle of due) {
    try {
      const result = await drawRaffleWinners(raffle.id);
      await announceRaffleResult(client, result.raffle, result.winners, result.entryCount);
    } catch (e) {
      if (e instanceof RaffleError) {
        // 참가자가 없는 등 재시도해도 똑같이 실패할 사유라 매분 재시도하지 않도록 하루 뒤로 미뤄둔다.
        // (관리자가 /이벤트마감추첨으로 직접 상태를 확인하고 처리할 수 있다.)
        await prisma.raffleEvent
          .update({ where: { id: raffle.id }, data: { closesAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } })
          .catch(() => {});
      } else {
        console.error("이벤트 자동 마감 실패:", e);
      }
    }
  }
}

export function startRaffleAutoCloseLoop(client: Client) {
  checkAutoCloseRaffles(client).catch((e) => console.error("이벤트 자동 마감 초기 실행 실패:", e));
  setInterval(() => {
    checkAutoCloseRaffles(client).catch((e) => console.error("이벤트 자동 마감 실패:", e));
  }, CHECK_INTERVAL_MS);
}
