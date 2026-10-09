"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Result, Submit, useIdempotentAction } from "@/components/forms";
import type { ActionResult } from "@/lib/errors";

type Action = (prev: unknown, fd: FormData) => Promise<ActionResult<unknown>>;

/**
 * Generic admin form: pending state, inline result, optional confirm for destructive actions.
 * Buttons inside may carry name="intent" to choose the command.
 */
export function AdminForm({
  action, children, submit, confirm, className, reset, actions,
}: {
  action: Action; children?: ReactNode; submit?: string; confirm?: string; className?: string; reset?: boolean; actions?: ReactNode;
}) {
  const [state, run, pending] = useIdempotentAction(action);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && reset) ref.current?.reset();
  }, [state, reset]);
  return (
    <form
      ref={ref}
      action={run}
      className={className ?? "space-y-3"}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      <Result state={state} />
      {submit || actions ? (
        <div className="flex flex-wrap gap-2">
          {submit ? <Submit pending={pending}>{submit}</Submit> : null}
          {actions}
        </div>
      ) : null}
    </form>
  );
}

export function IntentButton({ intent, children, tone = "ghost", confirm }: { intent: string; children: ReactNode; tone?: "primary" | "ghost" | "danger"; confirm?: string }) {
  return (
    <button
      type="submit"
      name="intent"
      value={intent}
      className={`btn btn-sm btn-${tone}`}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
