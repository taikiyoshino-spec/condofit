"use client";

import { useActionState, useRef, useState, useSyncExternalStore } from "react";
import { loginAction } from "@/app/actions/auth";
import { Avatar } from "@/components/avatar";
import { Field, FormMessage, PinInput, SubmitButton, TextInput } from "@/components/form";
import {
  forgetAccount,
  getAccountsServerSnapshot,
  getAccountsSnapshot,
  subscribeAccounts,
  type DeviceAccount,
} from "@/lib/client/device-accounts";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, undefined);
  // この端末でログインしたことのある人（端末内の記録のみ。サーバーからメンバー一覧は取得しない）
  const accounts = useSyncExternalStore(subscribeAccounts, getAccountsSnapshot, getAccountsServerSnapshot);
  const [selected, setSelected] = useState<DeviceAccount | null>(null);
  const [manual, setManual] = useState(false);
  const [editing, setEditing] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);

  const showPicker = accounts.length > 0 && !manual && !selected;

  if (showPicker) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">ログインする人を選んでください</p>
          <button type="button" onClick={() => setEditing((v) => !v)} className="text-xs text-muted">
            {editing ? "完了" : "編集"}
          </button>
        </div>
        <ul className="grid grid-cols-3 gap-3">
          {accounts.map((a) => (
            <li key={a.userId} className="relative">
              <button
                type="button"
                onClick={() => {
                  if (editing) return;
                  setSelected(a);
                  setTimeout(() => pinRef.current?.focus(), 0);
                }}
                className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-border bg-surface p-3"
              >
                <Avatar userId={a.userId} name={a.displayName} src={a.thumb} size={56} />
                <span className="w-full truncate text-center text-sm">{a.displayName}</span>
              </button>
              {editing && (
                <button
                  type="button"
                  aria-label={`${a.displayName}をこの端末から削除`}
                  onClick={() => forgetAccount(a.userId)}
                  className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-danger text-sm text-white"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setManual(true)} className="w-full rounded-lg border border-border py-2.5 text-sm">
          別の人でログイン
        </button>
        {editing && <p className="text-xs text-muted">×で、この端末の一覧から外します（アカウントは消えません）。</p>}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {selected ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
          <Avatar userId={selected.userId} name={selected.displayName} src={selected.thumb} size={44} />
          <span className="flex-1 font-medium">{selected.displayName}</span>
          <button type="button" onClick={() => setSelected(null)} className="text-sm text-muted">
            変更
          </button>
          <input type="hidden" name="display_name" value={selected.displayName} />
        </div>
      ) : (
        <Field label="表示名">
          <TextInput name="display_name" autoComplete="username" required maxLength={20} />
        </Field>
      )}
      <Field label="PIN（4桁）">
        <PinInput ref={pinRef} name="pin" autoComplete="current-password" />
      </Field>
      <FormMessage state={state} />
      <SubmitButton>ログイン</SubmitButton>
      {!selected && accounts.length > 0 && (
        <button type="button" onClick={() => setManual(false)} className="w-full text-sm text-muted">
          ‹ 一覧から選ぶ
        </button>
      )}
    </form>
  );
}
