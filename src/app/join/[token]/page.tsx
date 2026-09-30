import { findActiveInvite } from "@/lib/auth/service";
import { JoinForm } from "./join-form";

export default async function JoinPage({ params }: PageProps<"/join/[token]">) {
  const { token } = await params;
  const invite = await findActiveInvite(token);

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-2xl font-bold">CondoFitに参加</h1>
      {invite ? (
        <>
          <p className="mt-1 text-sm text-muted">{invite.groupName} に参加します</p>
          <div className="mt-8">
            <JoinForm token={token} />
          </div>
        </>
      ) : (
        <p className="mt-6 text-sm">
          この招待URLは無効です。管理者に新しい招待URLをもらってください。
        </p>
      )}
    </main>
  );
}
