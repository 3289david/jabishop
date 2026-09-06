import { requireAdmin } from "@/lib/actions/adminAuth";
import { SecurityTabs } from "@/components/admin/SecurityTabs";
import { TotpSetup } from "@/components/admin/TotpSetup";

export default async function Admin2faPage() {
  const admin = await requireAdmin();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">관리자 보안</h1>
      <SecurityTabs active="/admin/security/2fa" />
      <div className="bg-white border border-neutral-200 rounded-xl p-5 max-w-md">
        <h2 className="font-semibold text-sm mb-3">{admin.loginId} 계정 2단계 인증</h2>
        <TotpSetup totpEnabled={admin.totpEnabled} />
      </div>
    </div>
  );
}
