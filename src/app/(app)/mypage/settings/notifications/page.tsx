import { requireMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section } from "@/components/page";
import { PushToggle, SettingToggles } from "./controls";

export default async function NotificationSettingsPage() {
  const member = await requireMember();
  const supabase = await createClient();
  const { data } = await supabase
    .from("notification_settings")
    .select("check_in, location_stale, schedule")
    .eq("user_id", member.id)
    .maybeSingle();

  return (
    <>
      <PageHeader title="通知設定" back="/mypage/settings" />
      <Section title="この端末のプッシュ通知">
        <PushToggle vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />
      </Section>
      <Section title="通知の種類">
        <SettingToggles initial={data ?? { check_in: true, location_stale: true, schedule: true }} />
      </Section>
      <p className="px-4 text-xs text-muted">通知をOFFにしてもアプリはそのまま使えます。</p>
    </>
  );
}
