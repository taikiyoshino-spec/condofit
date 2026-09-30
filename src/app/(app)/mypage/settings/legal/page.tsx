import { PageHeader, Section } from "@/components/page";

// プレースホルダ文面（正式な文面は運用開始前に差し替える）
export default function LegalPage() {
  return (
    <>
      <PageHeader title="利用規約 / プライバシー" back="/mypage/settings" />
      <Section title="利用規約">
        <p className="text-sm text-muted">（準備中）CondoFitは招待されたメンバーだけが使える、仲間内のアプリです。</p>
      </Section>
      <Section title="プライバシー">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>位置情報はチェックイン時の判定にのみ使い、緯度・経度・距離・移動履歴は保存しません。</li>
          <li>他のメンバーに位置は公開されません。公開されるのは「Fit中」であることと、最後に位置を確認した時刻だけです。</li>
          <li>記録・予定はグループのメンバーだけが閲覧できます。</li>
        </ul>
      </Section>
    </>
  );
}
