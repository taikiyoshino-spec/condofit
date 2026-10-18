import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth/session";
import { isCookPath, safeNextPath } from "@/lib/auth/next-path";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = safeNextPath((await searchParams).next);
  const member = await getCurrentMember();
  if (member) redirect(next ?? (member.apps === "cook" ? "/cook" : "/"));
  const cook = next !== null && isCookPath(next);
  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-2xl font-bold">{cook ? "CondoCook" : "CondoFit"}</h1>
      <p className="mt-1 text-sm text-muted">{cook ? "仲間のレシピで、今日なに作る？" : "今度Fit行こう！"}</p>
      <div className="mt-8">
        <LoginForm next={next} />
      </div>
      <p className="mt-6 text-xs text-muted">
        PINを忘れた場合は管理者に連絡してください。はじめての方は管理者から届いた招待URLを開いてください。
      </p>
    </main>
  );
}
