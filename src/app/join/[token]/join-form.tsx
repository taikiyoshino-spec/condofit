"use client";

import { useActionState } from "react";
import { joinAction } from "@/app/actions/auth";
import { Field, FormMessage, PinInput, SubmitButton, TextInput } from "@/components/form";

export function JoinForm({ token }: { token: string }) {
  const [state, action] = useActionState(joinAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label="表示名" hint="メンバーに表示される名前です。あとから変更できます">
        <TextInput name="display_name" autoComplete="username" required maxLength={20} />
      </Field>
      <Field label="PIN（4桁の数字）" hint="ログインに使います。別の端末でも表示名とPINで復帰できます">
        <PinInput name="pin" autoComplete="new-password" />
      </Field>
      <Field label="PIN（確認）">
        <PinInput name="pin_confirm" autoComplete="new-password" />
      </Field>
      <FormMessage state={state} />
      <SubmitButton>参加する</SubmitButton>
    </form>
  );
}
