"use server";

import { requireMember } from "@/lib/auth/session";
import { AI_FAILURE_MESSAGE, geminiJsonResult } from "@/lib/ai/gemini";
import { getCatalog, getMyExerciseHistory } from "@/lib/records/queries";
import { getMyMenu } from "@/lib/menus/queries";
import {
  buildGeneratePrompt,
  buildTodayPrompt,
  cleanMenuRequest,
  cleanTodayRequest,
  completeWeightSets,
  GENERATE_SCHEMA,
  fitToTime,
  TODAY_PROPOSALS,
  TODAY_SCHEMA,
} from "@/lib/menus/generate";
import { matchExercise, parseMenuText, type TextMenu } from "@/lib/menus/text";
import { getPartSessions, listPartInfo, recentFourWeeks } from "@/lib/records/parts-queries";
import { partBalance } from "@/lib/records/parts";
import { todayJst } from "@/lib/date";
import type { MenuForEditor } from "@/app/(app)/records/session-editor";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 依頼文に入れる最近の種目の数 */
const RECENT_LIMIT = 25;

export type GenerateMenuResult = { ok: true; menu: TextMenu; comment: string | null } | { ok: false; error: string };

/** アプリのAIにメニューを作ってもらう（保存はしない。画面で確認してから「AIに相談して作る」と同じ流れで登録する） */
export async function generateMenuAction(raw: unknown, menuId: string | null): Promise<GenerateMenuResult> {
  const member = await requireMember();
  const [catalog, history, current] = await Promise.all([
    getCatalog(),
    getMyExerciseHistory(member.id),
    menuId && UUID_RE.test(menuId) ? getMyMenu(member.id, menuId) : Promise.resolve(null),
  ]);
  const request = cleanMenuRequest(raw, catalog.bodyParts.map((p) => p.name));
  if (!request) return { ok: false, error: "目的と時間を選んでください" };

  const partName = new Map(catalog.bodyParts.map((p) => [p.id, p.name]));
  const byId = new Map(catalog.exercises.map((e) => [e.id, e]));
  const prompt = buildGeneratePrompt({
    request,
    exercises: catalog.exercises.map((e) => ({
      name: e.name,
      type: e.type,
      part: e.bodyPartId ? (partName.get(e.bodyPartId) ?? null) : null,
      excludesBar: e.excludesBar,
    })),
    recent: history.recent
      .slice(0, RECENT_LIMIT)
      .flatMap((id) => (byId.has(id) ? [{ name: byId.get(id)!.name, sets: history.lastEntries[id] }] : [])),
    current,
  });

  const r = await geminiJsonResult<{ name?: string; comment?: string; items?: unknown }>(prompt, GENERATE_SCHEMA, {
    feature: "fit_menu",
    timeoutMs: 40000,
    temperature: 0.6,
  });
  if (!r.ok) return { ok: false, error: AI_FAILURE_MESSAGE[r.reason] };
  // 貼り付けのときと同じ読み取りで、数字の範囲や数を確かめる
  const parsed = parseMenuText(JSON.stringify({ name: r.data.name, items: r.data.items }));
  if (!parsed.ok) return { ok: false, error: "AIの答えをメニューにできませんでした。もう一度試してください" };
  // 重量系は「重さ×回数」にそろえる（AIが片方を省いたら前回の記録で補う）
  const items = parsed.menu.items.map((it) => {
    const hit = matchExercise(it.exercise, catalog.exercises);
    return hit?.type === "weight" ? { ...it, sets: completeWeightSets(it.sets, history.lastEntries[hit.id]) } : it;
  });
  const comment = String(r.data.comment ?? "").trim();
  return { ok: true, menu: { ...parsed.menu, items }, comment: comment ? [...comment].slice(0, 200).join("") : null };
}

/** reason: AIが選んだ理由。minutes: 種目ごとの目安の時間（menu.items と同じ順） */
export type TodayProposal = { menu: MenuForEditor; reason: string | null; minutes: number[]; dropped: string[] };
export type TodayMenuResult = { ok: true; proposals: TodayProposal[] } | { ok: false; error: string };

/**
 * 記録を始めるときに、今日の強さと希望・最近の記録から、AIに今日のメニューの案をいくつか作ってもらう（保存はしない）。
 * 一覧にない種目は外す（その場で記録を始めるため）
 */
export async function generateTodayMenuAction(raw: unknown): Promise<TodayMenuResult> {
  const member = await requireMember();
  const today = todayJst();
  const [catalog, history, parts, partSessions] = await Promise.all([
    getCatalog(),
    getMyExerciseHistory(member.id),
    listPartInfo(),
    getPartSessions({ userId: member.id, ...recentFourWeeks(today) }),
  ]);
  const request = cleanTodayRequest(raw, catalog.bodyParts.map((p) => p.name));
  if (!request) return { ok: false, error: "強さと時間を選んでください" };

  const partName = new Map(catalog.bodyParts.map((p) => [p.id, p.name]));
  const byId = new Map(catalog.exercises.map((e) => [e.id, e]));
  const balance = partBalance(partSessions, parts, new Set(parts.filter((p) => p.cardio).map((p) => p.id)));
  const prompt = buildTodayPrompt({
    request,
    exercises: catalog.exercises.map((e) => ({
      name: e.name,
      type: e.type,
      part: e.bodyPartId ? (partName.get(e.bodyPartId) ?? null) : null,
      excludesBar: e.excludesBar,
    })),
    recent: history.recent
      .slice(0, RECENT_LIMIT)
      .flatMap((id) => (byId.has(id) ? [{ name: byId.get(id)!.name, sets: history.lastEntries[id] }] : [])),
    parts: balance.strength
      .filter((p) => !parts.find((x) => x.id === p.partId)?.freeWeight)
      .map((p) => ({ name: p.name, sets: p.sets, daysAgo: p.lastDate ? Math.round((Date.parse(today) - Date.parse(p.lastDate)) / 86400e3) : null })),
  });

  type RawItem = { exercise?: unknown; minutes?: unknown; sets?: unknown };
  const r = await geminiJsonResult<{ menus?: { name?: string; reason?: string; items?: RawItem[] }[] }>(prompt, TODAY_SCHEMA, {
    feature: "fit_today",
    timeoutMs: 45000,
    temperature: 0.8,
  });
  if (!r.ok) return { ok: false, error: AI_FAILURE_MESSAGE[r.reason] };

  const proposals: TodayProposal[] = [];
  for (const m of (Array.isArray(r.data.menus) ? r.data.menus : []).slice(0, TODAY_PROPOSALS)) {
    const parsed = parseMenuText(JSON.stringify({ name: m?.name, items: m?.items }));
    if (!parsed.ok) continue;
    const matched: (MenuForEditor["items"][number] & { minutes: number | null })[] = [];
    const dropped: string[] = [];
    parsed.menu.items.forEach((it, i) => {
      const hit = matchExercise(it.exercise, catalog.exercises);
      const minutes = Number(m?.items?.[i]?.minutes);
      const sets = hit?.type === "weight" ? completeWeightSets(it.sets, history.lastEntries[hit.id]) : it.sets;
      if (hit) matched.push({ exerciseId: hit.id, name: hit.name, type: hit.type, sets, minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : null });
      else dropped.push(it.exercise);
    });
    // AIが時間を守らないこともあるので、アプリでも1種目の時間と合計を合わせる
    const fitted = fitToTime(matched, request.minutes, request.cardio);
    if (fitted.length === 0) continue;
    const reason = String(m?.reason ?? "").trim();
    proposals.push({
      menu: { id: null, name: parsed.menu.name, items: fitted.map(({ minutes: _, ...it }) => it) },
      reason: reason ? [...reason].slice(0, 80).join("") : null,
      minutes: fitted.map((it) => it.minutes),
      dropped,
    });
  }
  if (proposals.length === 0) return { ok: false, error: "ジムにある種目でメニューを作れませんでした。もう一度試してください" };
  return { ok: true, proposals };
}
