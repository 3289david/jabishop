// "자판기(샵) 통째로 구매" 상품 상세 페이지 전용 쇼케이스. glassmorphism 스타일 +
// 웹사이트/디스코드 미리보기를 CSS로 직접 그려서 실제 영상/스크린샷 파일 없이도
// 움직이는(섬세한 애니메이션) 시각적 미리보기를 보여준다.
export function ShopSubscriptionShowcase() {
  return (
    <div className="vm-showcase relative overflow-hidden rounded-3xl p-6 sm:p-10 mb-6">
      <div className="vm-blob vm-blob-a" />
      <div className="vm-blob vm-blob-b" />
      <div className="vm-blob vm-blob-c" />

      <div className="relative z-10">
        <div className="text-center mb-8">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase text-white/80 bg-white/10 border border-white/20 backdrop-blur-md px-3 py-1 rounded-full">
            🏪 자판기 · 샵 전체 복제
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mt-4 drop-shadow-sm">
            이 샵을 통째로, 내 이름으로
          </h2>
          <p className="text-white/70 text-sm sm:text-base mt-2 max-w-xl mx-auto">
            전용 웹사이트 + 디스코드 봇 + 관리자 패널까지, 지금 쓰고 있는 모든 기능이 그대로 내 것이 됩니다.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-5 mb-8">
          {/* 웹사이트 미리보기 (브라우저 창 목업) */}
          <div className="vm-float vm-glass rounded-2xl overflow-hidden">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-white/10 border-b border-white/10">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-300/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
              <span className="ml-3 text-[11px] text-white/60 font-mono truncate">내샵코드.krl.kr</span>
            </div>
            <div className="p-4 space-y-2.5">
              <div className="h-3 w-2/3 rounded bg-white/25 vm-shimmer" />
              <div className="h-2 w-5/6 rounded bg-white/10" />
              <div className="grid grid-cols-3 gap-2 pt-2">
                <div className="h-14 rounded-lg bg-white/10 border border-white/10" />
                <div className="h-14 rounded-lg bg-white/15 border border-white/10 vm-shimmer" />
                <div className="h-14 rounded-lg bg-white/10 border border-white/10" />
              </div>
              <div className="h-7 w-24 rounded-md bg-indigo-400/70 mt-2" />
            </div>
          </div>

          {/* 디스코드 봇 미리보기 (패널 목업) */}
          <div className="vm-float vm-float-delay vm-glass rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-white/10 border-b border-white/10">
              <span className="w-5 h-5 rounded-full bg-[#5865F2]/80 flex items-center justify-center text-[10px]">🤖</span>
              <span className="text-[11px] text-white/60">내 디스코드 서버</span>
            </div>
            <div className="p-4 space-y-2">
              <div className="h-2 w-1/2 rounded bg-white/15" />
              <div className="flex flex-wrap gap-2 pt-1">
                <span className="text-[11px] text-white/80 bg-white/10 border border-white/10 px-2.5 py-1 rounded-md vm-shimmer">
                  🛍️ 구매하기
                </span>
                <span className="text-[11px] text-white/80 bg-white/10 border border-white/10 px-2.5 py-1 rounded-md">
                  💰 포인트 충전
                </span>
                <span className="text-[11px] text-white/80 bg-white/10 border border-white/10 px-2.5 py-1 rounded-md">
                  🎟️ 쿠폰함
                </span>
                <span className="text-[11px] text-white/80 bg-white/10 border border-white/10 px-2.5 py-1 rounded-md">
                  🎉 이벤트
                </span>
              </div>
              <div className="h-10 rounded-lg bg-white/10 border border-white/10 mt-2" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          {[
            ["🌐", "전용 웹사이트"],
            ["🤖", "전용 디스코드 봇"],
            ["🔐", "본인 OAuth 로그인"],
            ["💳", "입금 자동승인"],
            ["🛠️", "관리자 패널"],
            ["🎉", "이벤트 시스템"],
          ].map(([icon, label]) => (
            <div
              key={label}
              className="vm-glass rounded-xl px-3 py-2.5 flex items-center gap-2 text-white/85"
            >
              <span className="text-base">{icon}</span>
              <span className="text-xs sm:text-sm font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .vm-showcase {
          background: linear-gradient(135deg, #312e81 0%, #4c1d95 45%, #701a75 100%);
        }
        .vm-glass {
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid rgba(255, 255, 255, 0.15);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }
        .vm-blob {
          position: absolute;
          border-radius: 9999px;
          filter: blur(60px);
          opacity: 0.55;
          pointer-events: none;
        }
        .vm-blob-a {
          width: 260px; height: 260px;
          top: -60px; left: -40px;
          background: radial-gradient(circle, #818cf8, transparent 70%);
          animation: vm-drift-a 12s ease-in-out infinite;
        }
        .vm-blob-b {
          width: 220px; height: 220px;
          bottom: -50px; right: -30px;
          background: radial-gradient(circle, #f472b6, transparent 70%);
          animation: vm-drift-b 14s ease-in-out infinite;
        }
        .vm-blob-c {
          width: 180px; height: 180px;
          bottom: 20%; left: 35%;
          background: radial-gradient(circle, #34d399, transparent 70%);
          animation: vm-drift-a 16s ease-in-out infinite reverse;
        }
        @keyframes vm-drift-a {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(20px, 25px); }
        }
        @keyframes vm-drift-b {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-25px, -15px); }
        }
        .vm-float {
          animation: vm-float-y 6s ease-in-out infinite;
        }
        .vm-float-delay {
          animation-delay: 1.5s;
        }
        @keyframes vm-float-y {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        .vm-shimmer {
          position: relative;
          overflow: hidden;
        }
        .vm-shimmer::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent);
          animation: vm-shimmer-move 2.4s ease-in-out infinite;
        }
        @keyframes vm-shimmer-move {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .vm-blob, .vm-float, .vm-shimmer::after { animation: none; }
        }
      `}</style>
    </div>
  );
}
