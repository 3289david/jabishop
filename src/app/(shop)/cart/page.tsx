import { requireUser } from "@/lib/actions/auth";
import { prisma } from "@/lib/prisma";
import { updateCartQtyAction, removeFromCartAction } from "@/lib/actions/shop";
import { CheckoutButton } from "@/components/CheckoutButton";

export default async function CartPage() {
  const user = await requireUser();
  const items = await prisma.cartItem.findMany({
    where: { userId: user.id },
    include: { tier: true },
    orderBy: { createdAt: "asc" },
  });

  const total = items.reduce((sum, i) => sum + i.tier.price * i.quantity, 0);

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-4">장바구니</h1>
      <div className="bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-100">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between p-4 gap-4">
            <div className="flex-1">
              <div className="font-medium">{item.tier.name}</div>
              <div className="text-sm text-neutral-400">{item.tier.price.toLocaleString()}P</div>
            </div>
            <form action={updateCartQtyAction} className="flex items-center gap-2">
              <input type="hidden" name="itemId" value={item.id} />
              <input
                type="number"
                name="quantity"
                defaultValue={item.quantity}
                min={1}
                className="w-16 border rounded-md px-2 py-1 text-sm"
              />
              <button className="text-xs text-indigo-600 hover:underline">변경</button>
            </form>
            <div className="w-24 text-right font-semibold">
              {(item.tier.price * item.quantity).toLocaleString()}P
            </div>
            <form action={removeFromCartAction}>
              <input type="hidden" name="itemId" value={item.id} />
              <button className="text-xs text-neutral-400 hover:text-red-500">삭제</button>
            </form>
          </div>
        ))}
        {items.length === 0 && <p className="text-center text-neutral-400 py-12">장바구니가 비어 있습니다.</p>}
      </div>

      {items.length > 0 && (
        <div className="mt-4 flex items-center justify-between bg-white border border-neutral-200 rounded-xl p-4">
          <div>
            <div className="text-sm text-neutral-400">보유 포인트 {user.points.toLocaleString()}P</div>
            <div className="text-lg font-bold">합계 {total.toLocaleString()}P</div>
          </div>
          <CheckoutButton disabled={user.points < total} />
        </div>
      )}
    </div>
  );
}
