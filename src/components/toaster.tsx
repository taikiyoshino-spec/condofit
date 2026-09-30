"use client";

import { useEffect, useState } from "react";

const EVENT = "condofit:toast";

export function showToast(message: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: message }));
}

export function Toaster() {
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  useEffect(() => {
    const onToast = (e: Event) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, message: (e as CustomEvent<string>).detail }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex flex-col items-center gap-2 p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="rounded-full bg-fg px-4 py-2 text-sm text-bg shadow-lg">
          {t.message}
        </div>
      ))}
    </div>
  );
}
