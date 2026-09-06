import { redirect } from "next/navigation";

// 회원가입은 Discord 로그인과 완전히 동일한 절차이므로 별도 폼 없이 로그인 페이지로 보낸다.
export default function SignupPage() {
  redirect("/login");
}
