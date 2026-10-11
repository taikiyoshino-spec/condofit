import { redirect } from "next/navigation";

// 成長一覧は「成長」タブに統合
export default function ProgressListPage() {
  redirect("/growth");
}
