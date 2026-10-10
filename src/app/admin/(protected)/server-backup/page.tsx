import { prisma } from "@/lib/prisma";
import { createBackupAction, restoreSameServerAction, cloneToNewServerAction } from "@/lib/actions/adminServerBackup";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "⏳ 대기 중",
  RUNNING: "🔄 진행 중",
  DONE: "✅ 완료",
  FAILED: "❌ 실패",
};

export default async function AdminServerBackupPage() {
  const backups = await prisma.serverBackup.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { restoreJobs: { orderBy: { createdAt: "desc" } } },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">서버 백업 / 복원 / 복제</h1>
      <p className="text-sm text-neutral-500">
        백업은 채널·카테고리·역할·권한·메시지(내용/첨부파일 링크/반응)·멤버(역할 목록)를 전부 수집합니다.
        디스코드 레이트리밋 때문에 서버 규모에 따라 수십 분~그 이상 걸릴 수 있어, 봇이 백그라운드에서
        처리합니다. 복원은 삭제된 채널/역할만 새로 만들고(기존 채널은 그대로 둬 중복 안 생김), 복제는
        다른 서버(미리 봇을 초대해둬야 함)에 전체 구조+메시지를 새로 만듭니다. 멤버는 디스코드 정책상
        봇이 강제로 옮길 수 없어서, 복제 시 모든 백업 멤버에게 새 서버 초대 링크를 DM으로 보내는
        것까지만 합니다(역할은 자동으로 재적용되지 않음).
      </p>

      <form action={createBackupAction}>
        <button className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700">
          새 백업 시작
        </button>
      </form>

      <div className="space-y-3">
        {backups.map((b) => (
          <div key={b.id} className="bg-white border border-neutral-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-medium">{b.label}</div>
              <span className="text-sm">{STATUS_LABEL[b.status] ?? b.status}</span>
            </div>
            <div className="text-xs text-neutral-500">
              채널 {b.channelCount} · 역할 {b.roleCount} · 메시지 {b.messageCount} · 멤버 {b.memberCount}
              {b.progress && ` · ${b.progress}`}
            </div>
            {b.error && <div className="text-xs text-red-600">오류: {b.error}</div>}

            {b.status === "DONE" && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <form action={restoreSameServerAction}>
                  <input type="hidden" name="backupId" value={b.id} />
                  <button className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700">
                    같은 서버로 복원
                  </button>
                </form>
                <form action={cloneToNewServerAction} className="flex items-center gap-1">
                  <input type="hidden" name="backupId" value={b.id} />
                  <input
                    type="text"
                    name="targetGuildId"
                    placeholder="대상 서버(길드) ID"
                    className="border border-neutral-300 rounded px-2 py-1 text-xs w-40"
                  />
                  <button className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700">
                    다른 서버로 복제
                  </button>
                </form>
              </div>
            )}

            {b.restoreJobs.length > 0 && (
              <div className="text-xs text-neutral-500 border-t border-neutral-100 pt-2 space-y-1">
                {b.restoreJobs.map((j) => (
                  <div key={j.id}>
                    {j.mode === "RESTORE_SAME" ? "복원" : `복제 → ${j.targetGuildId}`} · {STATUS_LABEL[j.status] ?? j.status}
                    {j.progress && ` · ${j.progress}`}
                    {j.error && ` · 오류: ${j.error}`}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {backups.length === 0 && <p className="text-center text-neutral-400 py-10">아직 백업이 없습니다.</p>}
      </div>
    </div>
  );
}
