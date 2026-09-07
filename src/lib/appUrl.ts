// 리버스 프록시(nginx) 뒤에서 `next start`로 셀프호스팅하면, 이 Next.js 빌드는
// 라우트 핸들러의 request.url origin을 실제 요청 Host가 아니라 서버 자신의
// localhost:PORT로 채운다. 그래서 NextResponse.redirect(new URL(path, req.url))는
// 브라우저를 localhost로 보내버린다 - 대신 이미 알고 있는 공개 도메인(OAuth 리다이렉트
// URI에서 유추)을 origin으로 써야 한다.
export function getAppOrigin(): string {
  const redirectUri = process.env.DISCORD_OAUTH_REDIRECT_URI;
  if (redirectUri) {
    try {
      return new URL(redirectUri).origin;
    } catch {
      // fall through to default
    }
  }
  return "http://localhost:3000";
}
