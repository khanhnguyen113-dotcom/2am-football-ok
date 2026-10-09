"use client";

import { useActionState, useRef, type ReactNode } from "react";
import type { ActionResult } from "@/lib/errors";

type Action<T> = (prev: unknown, fd: FormData) => Promise<ActionResult<T>>;

/**
 * Wraps a server action with a stable idempotency key (request_id): retries after a network
 * error reuse the same key; a new key is generated only after the server confirms success.
 */
export function useIdempotentAction<T>(action: Action<T>) {
  const key = useRef<string | null>(null);
  return useActionState<ActionResult<T> | null, FormData>(async (prev, fd) => {
    if (!key.current) key.current = crypto.randomUUID();
    fd.set("request_id", key.current);
    const res = await action(prev, fd);
    if (res.ok) key.current = null;
    return res;
  }, null);
}

export function Submit({ pending, children, className, name, value }: {
  pending: boolean; children: ReactNode; className?: string; name?: string; value?: string;
}) {
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={className ?? "btn btn-primary w-full sm:w-auto"}>
      {pending ? <Spinner /> : null}
      {pending ? "Đang xử lý…" : children}
    </button>
  );
}

export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />;
}

export function Result({ state }: { state: ActionResult<unknown> | null }) {
  if (!state) return null;
  if (!state.ok) return <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>;
  if (state.message) return <p role="status" className="rounded-lg border border-neon/30 bg-neon/10 px-3 py-2 text-sm text-neon">{state.message}</p>;
  return null;
}

export type MemberOption = { id: string; label: string; sub?: string };

export function MemberSelect({ name = "member_id", options, defaultValue, required = true, label = "Chọn tên của bạn" }: {
  name?: string; options: MemberOption[]; defaultValue?: string; required?: boolean; label?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select name={name} required={required} defaultValue={defaultValue ?? ""} className="field">
        <option value="" disabled>— Chọn thành viên —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}{o.sub ? ` · ${o.sub}` : ""}</option>
        ))}
      </select>
    </label>
  );
}

export function ChoiceGroup({ name, options, defaultValue, label }: {
  name: string; label: string; options: { value: string; label: string; tone?: "yes" | "no" | "maybe" }[]; defaultValue?: string;
}) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className={`grid gap-2 ${options.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {options.map((o) => (
          <label key={o.value} className="relative cursor-pointer">
            <input type="radio" name={name} value={o.value} defaultChecked={defaultValue === o.value} className="peer sr-only" required />
            <span
              className={`flex min-h-12 items-center justify-center rounded-lg border border-white/12 bg-white/5 px-2 text-center font-display text-base font-bold uppercase tracking-wide transition peer-focus-visible:ring-2 peer-focus-visible:ring-neon ${
                o.tone === "yes"
                  ? "peer-checked:border-neon peer-checked:bg-neon/15 peer-checked:text-neon"
                  : o.tone === "no"
                    ? "peer-checked:border-danger peer-checked:bg-danger/15 peer-checked:text-danger"
                    : "peer-checked:border-warn peer-checked:bg-warn/15 peer-checked:text-warn"
              }`}
            >
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
