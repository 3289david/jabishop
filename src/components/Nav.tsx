import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { logoutAction } from "@/lib/actions/auth";
import { prisma } from "@/lib/prisma";

export async function Nav() {
  const user = await getCurrentUser();
  const unreadCount = user
    ? await prisma.notification.count({ where: { userId: user.id, isRead: false } })
    : 0;

  return (
    <header className="border-b border-neutral-200 bg-white sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="text-xl font-bold tracking-tight text-indigo-600">
          🎨 자비샵
        </Link>
        <nav className="hidden sm:flex items-center gap-5 text-sm text-neutral-600">
          <Link href="/products" className="hover:text-indigo-600">
            상품
          </Link>
          {user && (
            <Link href="/cart" className="hover:text-indigo-600">
              장바구니
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <Link href="/mypage/points" className="text-neutral-700 hover:text-indigo-600">
                {user.points.toLocaleString()}P
              </Link>
              <Link href="/mypage/notifications" className="relative text-neutral-700 hover:text-indigo-600">
                알림
                {unreadCount > 0 && (
                  <span className="absolute -top-2 -right-3 bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5">
                    {unreadCount}
                  </span>
                )}
              </Link>
              <Link href="/mypage" className="text-neutral-700 hover:text-indigo-600">
                {user.name}님
              </Link>
              <form action={logoutAction}>
                <button className="text-neutral-400 hover:text-neutral-700">로그아웃</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="text-neutral-700 hover:text-indigo-600">
                로그인
              </Link>
              <Link
                href="/signup"
                className="bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700"
              >
                회원가입
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
