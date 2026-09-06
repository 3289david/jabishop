import { prisma } from "@/lib/prisma";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { PurgeSeedDataForm } from "@/components/admin/PurgeSeedDataForm";

export default async function AdminSettingsPage() {
  const [settings, seedUserCount, seedArtworkCount] = await Promise.all([
    prisma.shopSetting.findUnique({ where: { id: "singleton" } }),
    prisma.user.count({ where: { isSeedData: true } }),
    prisma.artwork.count({ where: { isSeedData: true } }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">관리자 설정</h1>
      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <SettingsForm settings={settings} />
      </div>
      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <h2 className="font-semibold text-sm mb-2">데모 데이터 정리 (SUPER 전용)</h2>
        <PurgeSeedDataForm userCount={seedUserCount} artworkCount={seedArtworkCount} />
      </div>
    </div>
  );
}
