"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps, ReactNode } from "react";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function TextInput(props: ComponentProps<"input">) {
  return (
    <input
      {...props}
      className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-accent"
    />
  );
}

export function PinInput(props: Omit<ComponentProps<"input">, "type">) {
  return (
    <TextInput
      type="password"
      inputMode="numeric"
      pattern="\d{4}"
      maxLength={4}
      minLength={4}
      autoComplete="off"
      required
      {...props}
    />
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" }) {
  const { pending } = useFormStatus();
  const styles = {
    primary: "bg-accent text-accent-fg",
    secondary: "border border-border bg-surface",
    danger: "border border-danger text-danger bg-surface",
  }[variant];
  return (
    <button
      type="submit"
      disabled={pending || props.disabled}
      {...props}
      className={`w-full rounded-lg px-4 py-2.5 font-medium disabled:opacity-50 ${styles} ${props.className ?? ""}`}
    >
      {pending ? "処理中…" : children}
    </button>
  );
}

export function FormMessage({ state }: { state?: { error?: string; message?: string } }) {
  if (state?.error) return <p role="alert" className="text-sm text-danger">{state.error}</p>;
  if (state?.message) return <p role="status" className="text-sm text-accent">{state.message}</p>;
  return null;
}
