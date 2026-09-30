import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentMember()) redirect("/");
  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-2xl font-bold">CondoFit</h1>
      <p className="mt-1 text-sm text-muted">今度Fit行こう！</p>
      <div className="mt-8">
        <LoginForm />
      </div>
      <p className="mt-6 text-xs text-muted">
        PINを忘れた場合は管理者に連絡してください。はじめての方は管理者から届いた招待URLを開いてください。
      </p>
    </main>
  );
}
