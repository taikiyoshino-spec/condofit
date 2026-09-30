"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
import { Field, FormMessage, PinInput, SubmitButton, TextInput } from "@/components/form";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <Field label="表示名">
        <TextInput name="display_name" autoComplete="username" required maxLength={20} />
      </Field>
      <Field label="PIN（4桁）">
        <PinInput name="pin" autoComplete="current-password" />
      </Field>
      <FormMessage state={state} />
      <SubmitButton>ログイン</SubmitButton>
    </form>
  );
}
