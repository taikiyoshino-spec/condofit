"use client";

import { useActionState } from "react";
import { changeDisplayNameAction, changePinAction, withdrawAction } from "@/app/actions/auth";
import { Field, FormMessage, PinInput, SubmitButton, TextInput } from "@/components/form";

export function DisplayNameForm({ current }: { current: string }) {
  const [state, action] = useActionState(changeDisplayNameAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <Field label="表示名" hint="過去の記録も新しい表示名で表示されます">
        <TextInput name="display_name" defaultValue={current} required maxLength={20} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton>変更する</SubmitButton>
    </form>
  );
}

export function PinForm() {
  const [state, action] = useActionState(changePinAction, undefined);
  return (
    <form action={action} className="space-y-3" key={state?.message}>
      <Field label="現在のPIN">
        <PinInput name="current_pin" autoComplete="current-password" />
      </Field>
      <Field label="新しいPIN">
        <PinInput name="new_pin" autoComplete="new-password" />
      </Field>
      <Field label="新しいPIN（確認）">
        <PinInput name="new_pin_confirm" autoComplete="new-password" />
      </Field>
      <FormMessage state={state} />
      <SubmitButton>変更する</SubmitButton>
    </form>
  );
}

export function WithdrawForm() {
  const [state, action] = useActionState(withdrawAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-muted">
        退会するとログインできなくなります。これまでの記録・予定参加履歴はグループ内に残ります。
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="confirm" value="yes" required /> 退会することを確認しました
      </label>
      <FormMessage state={state} />
      <SubmitButton variant="danger">退会する</SubmitButton>
    </form>
  );
}
