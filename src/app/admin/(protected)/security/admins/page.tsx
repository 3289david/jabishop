import { prisma } from "@/lib/prisma";
import { SecurityTabs } from "@/components/admin/SecurityTabs";
import { CreateAdminForm } from "@/components/admin/CreateAdminForm";
import { AdminRoleForm } from "@/components/admin/AdminRoleForm";

export default async function AdminAccountsPage() {
  const admins = await prisma.adminUser.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">관리자 보안</h1>
      <SecurityTabs active="/admin/security/admins" />

      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <h2 className="font-semibold text-sm mb-3">관리자 계정 생성 (SUPER 전용)</h2>
        <CreateAdminForm />
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2">ID</th>
              <th className="text-left px-4 py-2">이름</th>
              <th className="text-left px-4 py-2">권한/상태</th>
              <th className="text-left px-4 py-2">2FA</th>
              <th className="text-left px-4 py-2">디스코드 연동</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id} className="border-t border-neutral-100">
                <td className="px-4 py-2 font-mono text-xs">{a.loginId}</td>
                <td className="px-4 py-2">{a.name}</td>
                <td className="px-4 py-2">
                  <AdminRoleForm admin={a} />
                </td>
                <td className="px-4 py-2">{a.totpEnabled ? "사용중" : "미설정"}</td>
                <td className="px-4 py-2 text-xs text-neutral-400">{a.discordId ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
