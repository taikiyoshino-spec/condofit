"use client";

import { useEffect, useState } from "react";

const EVENT = "condofit:toast";

type ToastOptions = { variant?: "default" | "celebrate"; durationMs?: number };
type Toast = { id: number; message: string; variant: "default" | "celebrate" };

export function showToast(message: string, options: ToastOptions = {}) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, ...options } }));
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    const onToast = (e: Event) => {
      const { message, variant = "default", durationMs } = (e as CustomEvent<{ message: string } & ToastOptions>).detail;
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, message, variant }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), durationMs ?? (variant === "celebrate" ? 6000 : 4000));
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex flex-col items-center gap-2 p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]" aria-live="polite">
      {toasts.map((t) =>
        t.variant === "celebrate" ? (
          <div key={t.id} className="max-w-[90vw] rounded-2xl bg-accent px-4 py-2.5 text-center text-sm font-semibold text-accent-fg shadow-lg">
            {t.message}
          </div>
        ) : (
          <div key={t.id} className="rounded-full bg-fg px-4 py-2 text-sm text-bg shadow-lg">
            {t.message}
          </div>
        ),
      )}
    </div>
  );
}
