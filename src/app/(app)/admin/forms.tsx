"use client";

import { useActionState, useState } from "react";
import { deactivateAction, issueInviteAction, resetPinAction, setRoleAction } from "@/app/actions/auth";
import { Field, FormMessage, PinInput, SubmitButton } from "@/components/form";

export function InviteForm() {
  const [state, action] = useActionState(issueInviteAction, undefined);
  const [copied, setCopied] = useState(false);
  return (
    <form action={action} className="space-y-3">
      {state?.inviteUrl && (
        <div className="space-y-2 rounded-lg bg-bg p-3">
          <p className="break-all text-sm">{state.inviteUrl}</p>
          <button
            type="button"
            className="text-sm font-medium text-accent"
            onClick={async () => {
              await navigator.clipboard.writeText(state.inviteUrl!);
              setCopied(true);
            }}
          >
            {copied ? "コピーしました" : "コピー"}
          </button>
        </div>
      )}
      <FormMessage state={state} />
      <SubmitButton variant="secondary">招待URLを発行</SubmitButton>
    </form>
  );
}

type MemberProps = {
  userId: string;
  displayName: string;
  role: "admin" | "member";
  isSelf: boolean;
  isLastAdmin: boolean;
};

export function MemberActions({ userId, displayName, role, isSelf, isLastAdmin }: MemberProps) {
  const [open, setOpen] = useState(false);
  const [roleState, roleAction] = useActionState(setRoleAction, undefined);
  const [pinState, pinAction] = useActionState(resetPinAction, undefined);
  const [deactState, deactAction] = useActionState(deactivateAction, undefined);

  if (!open) {
    return (
      <button type="button" className="mt-1 text-sm text-accent" onClick={() => setOpen(true)}>
        操作
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-4">
      <form action={roleAction} className="space-y-2">
        <input type="hidden" name="user_id" value={userId} />
        <input type="hidden" name="role" value={role === "admin" ? "member" : "admin"} />
        <FormMessage state={roleState} />
        <SubmitButton variant="secondary" disabled={isLastAdmin}>
          {role === "admin" ? "メンバーに変更" : "管理者にする"}
        </SubmitButton>
        {isLastAdmin && <p className="text-xs text-muted">最後の管理者は降格できません</p>}
      </form>

      <form action={pinAction} className="space-y-2" key={pinState?.message}>
        <input type="hidden" name="user_id" value={userId} />
        <p className="text-xs text-muted">LINE等で本人確認をしてから新しいPINを設定してください。現在のPINは見られません。</p>
        <Field label="新しいPIN">
          <PinInput name="pin" autoComplete="new-password" />
        </Field>
        <Field label="新しいPIN（確認）">
          <PinInput name="pin_confirm" autoComplete="new-password" />
        </Field>
        <FormMessage state={pinState} />
        <SubmitButton variant="secondary">PINを再設定</SubmitButton>
      </form>

      {!isSelf && (
        <form
          action={deactAction}
          className="space-y-2"
          onSubmit={(e) => {
            // ブラウザのconfirmは使わず、チェックボックスで確認する
            const ok = (e.currentTarget.elements.namedItem("confirm") as HTMLInputElement).checked;
            if (!ok) e.preventDefault();
          }}
        >
          <input type="hidden" name="user_id" value={userId} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="confirm" required /> {displayName} さんを利用停止にする（記録は残ります）
          </label>
          <FormMessage state={deactState} />
          <SubmitButton variant="danger">利用停止</SubmitButton>
        </form>
      )}
    </div>
  );
}
