import { redirect } from "next/navigation";

// CondoCook のトップは、いちばんよく使う買い物リスト（ホーム画面のアイコン・ログイン後もここから）
export default function CookTopPage() {
  redirect("/cook/shopping");
}
