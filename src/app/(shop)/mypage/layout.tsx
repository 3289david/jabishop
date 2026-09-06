import Link from "next/link";
import { requireUser } from "@/lib/actions/auth";

const NAV = [
  { href: "/mypage", label: "마이페이지 홈" },
  { href: "/mypage/orders", label: "주문 내역" },
  { href: "/mypage/points", label: "포인트" },
  { href: "/mypage/coupons", label: "쿠폰함" },
  { href: "/mypage/inquiries", label: "문의 내역" },
  { href: "/mypage/notifications", label: "알림" },
];

export default async function MyPageLayout({ children }: { children: React.ReactNode }) {
  await requireUser();

  return (
    <div className="grid md:grid-cols-4 gap-6">
      <aside className="md:col-span-1">
        <nav className="bg-white border border-neutral-200 rounded-xl p-2 text-sm space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded-md hover:bg-neutral-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="md:col-span-3">{children}</div>
    </div>
  );
}
