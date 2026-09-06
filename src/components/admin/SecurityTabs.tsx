import Link from "next/link";

const TABS = [
  { href: "/admin/security/admins", label: "관리자 계정" },
  { href: "/admin/security/2fa", label: "내 2FA 설정" },
  { href: "/admin/security/login-logs", label: "로그인 기록" },
  { href: "/admin/security/activity-logs", label: "활동 로그" },
];

export function SecurityTabs({ active }: { active: string }) {
  return (
    <div className="flex gap-1 border-b border-neutral-200 mb-4">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`px-3 py-2 text-sm ${
            active === t.href
              ? "border-b-2 border-indigo-600 text-indigo-600 font-medium"
              : "text-neutral-500 hover:text-neutral-800"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
