import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { defaultPerformedAt, getCatalog, getMyExerciseHistory } from "@/lib/records/queries";
import { isCheckedIn } from "@/lib/checkin/service";
import { aiAvailable } from "@/lib/ai/gemini";
import { TodayAi } from "./today-ai";

// AIの返事を待つため
export const maxDuration = 60;

/** 記録を始める: AIと相談して、今日のメニューをその場で作ってもらい、そのまま記録する */
export default async function RecordWithAiPage() {
  if (!aiAvailable()) redirect("/records/start");
  const member = await requireMember();
  const [catalog, history, performedAt, checkedIn] = await Promise.all([
    getCatalog(),
    getMyExerciseHistory(member.id),
    defaultPerformedAt(member.id),
    isCheckedIn(member.id),
  ]);
  return <TodayAi catalog={catalog} history={history} performedAt={performedAt} checkedIn={checkedIn} />;
}
