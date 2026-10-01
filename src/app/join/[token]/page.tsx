import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth/session";
import { findActiveInvite } from "@/lib/auth/service";
import { JoinForm } from "./join-form";

// 登録後に同じ招待URLを開き直す人が多いため、ログイン済みならホームへ、未ログインならログインへの導線を出す
function LoginLink() {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-sm">すでに登録済みの方はこちら</p>
      <Link
        href="/login"
        className="mt-2 block w-full rounded-lg bg-accent px-4 py-2.5 text-center font-medium text-accent-fg"
      >
        ログイン
      </Link>
    </div>
  );
}

export default async function JoinPage({ params }: PageProps<"/join/[token]">) {
  if (await getCurrentMember()) redirect("/");
  const { token } = await params;
  const invite = await findActiveInvite(token);

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-2xl font-bold">CondoFit</h1>
      <div className="mt-6">
        <LoginLink />
      </div>

      <h2 className="mt-8 text-lg font-semibold">はじめての方</h2>
      {invite ? (
        <>
          <p className="mt-1 text-sm text-muted">{invite.groupName} に参加します</p>
          <div className="mt-4">
            <JoinForm token={token} />
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm">この招待URLは無効です。管理者に新しい招待URLをもらってください。</p>
      )}
    </main>
  );
}
