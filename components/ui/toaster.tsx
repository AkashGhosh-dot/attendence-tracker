"use client"

import { useToastStore } from "@/lib/use-toast"

export function Toaster() {
  const toasts = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          role="alert"
          className={[
            "px-4 py-3 rounded-lg shadow-lg text-sm text-white max-w-xs w-full",
            "animate-in slide-in-from-bottom-4 fade-in duration-200",
            t.type === "success"
              ? "bg-green-600"
              : t.type === "error"
                ? "bg-red-600"
                : "bg-slate-700",
          ].join(" ")}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
