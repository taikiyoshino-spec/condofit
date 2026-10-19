"use client";

import { useState, useTransition } from "react";
import { moveToHouseholdAction, renameHouseholdAction, type AdminResult } from "@/app/actions/cook-admin";
import { useProfile } from "@/components/avatar";
import { showToast } from "@/components/toaster";
import type { AdminHousehold } from "@/lib/cook/queries";
import { Owner } from "../../owner";

const NEW = "new";

export function HouseholdEditor({ households, noHousehold }: { households: AdminHousehold[]; noHousehold: string[] }) {
  return (
    <div className="space-y-3 pb-8">
      {households
        .filter((h) => h.memberIds.length > 0)
        .map((h) => (
          <HouseholdCard key={h.id} household={h} households={households} />
        ))}
      {noHousehold.length > 0 && (
        <section className="mx-4 rounded-xl border border-dashed border-border p-4">
          <h2 className="mb-1 font-semibold">家族なし</h2>
          <p className="mb-2 text-xs text-muted">まだ CondoCook を開いていないメンバー。開くと1人の家族ができます。</p>
          <ul className="divide-y divide-border">
            {noHousehold.map((id) => (
              <MemberRow key={id} userId={id} currentId={null} households={households} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function HouseholdCard({ household, households }: { household: AdminHousehold; households: AdminHousehold[] }) {
  const [pending, startTransition] = useTransition();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(household.name);
  const rename = () =>
    startTransition(async () => {
      const r = await renameHouseholdAction(household.id, name);
      if (!r.ok) return showToast(r.error);
      showToast("名前を変更しました");
      setRenaming(false);
    });

  return (
    <section className="mx-4 rounded-xl border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        {renaming ? (
          <>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              aria-label="家族の名前"
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1"
            />
            <button type="button" disabled={pending} onClick={rename} className="text-sm text-accent">
              保存
            </button>
            <button type="button" onClick={() => setRenaming(false)} className="text-sm text-muted">
              やめる
            </button>
          </>
        ) : (
          <>
            <h2 className="flex-1 font-semibold">
              {household.name}
              <span className="ml-1 text-sm font-normal text-muted">（{household.memberIds.length}人）</span>
            </h2>
            <button
              type="button"
              onClick={() => {
                setName(household.name);
                setRenaming(true);
              }}
              className="text-xs text-accent"
            >
              名前を変更
            </button>
          </>
        )}
      </div>
      <ul className="divide-y divide-border">
        {household.memberIds.map((id) => (
          <MemberRow key={id} userId={id} currentId={household.id} households={households} />
        ))}
      </ul>
    </section>
  );
}

/** メンバーを別の家族へ移す（行き先を選んで確かめてから移す） */
function MemberRow({ userId, currentId, households }: { userId: string; currentId: string | null; households: AdminHousehold[] }) {
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState("");
  const name = useProfile(userId)?.displayName ?? "メンバー";
  const current = households.find((h) => h.id === currentId);
  const alone = Boolean(current && current.memberIds.length === 1);
  const targetName = target === NEW ? "新しい家族" : households.find((h) => h.id === target)?.name;
  const move = () =>
    startTransition(async () => {
      const r: AdminResult = await moveToHouseholdAction(userId, target === NEW ? null : target);
      if (!r.ok) return showToast(r.error);
      showToast(`${name}さんを移しました`);
      setTarget("");
    });

  return (
    <li className="py-2">
      <div className="flex items-center gap-2">
        <Owner userId={userId} size={28} className="flex-1" />
        <select
          value={target}
          disabled={pending}
          onChange={(e) => setTarget(e.target.value)}
          aria-label={`${name}さんを移す家族`}
          className="max-w-[45%] rounded-lg border border-border bg-surface px-2 py-1 text-sm"
        >
          <option value="">移す…</option>
          {households
            .filter((h) => h.id !== currentId && h.memberIds.length > 0)
            .map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          {!alone && <option value={NEW}>新しい家族を作る</option>}
        </select>
      </div>
      {target && (
        <div className="mt-2 rounded-lg bg-bg p-3 text-sm">
          <p>
            {name}さんを「{targetName}」に移します。
            {alone && current && `「${current.name}」は空になるので、買い物リスト・食材リストを移した先にまとめてから消します。`}
          </p>
          <div className="mt-2 flex justify-end gap-3">
            <button type="button" onClick={() => setTarget("")} className="text-muted">
              やめる
            </button>
            <button type="button" disabled={pending} onClick={move} className="font-semibold text-accent">
              {pending ? "移しています…" : "移す"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
