import { TierForm } from "@/components/admin/TierForm";

export default function NewTierPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">등급 추가</h1>
      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <TierForm />
      </div>
    </div>
  );
}
