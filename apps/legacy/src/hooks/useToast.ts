import { useCallback, useRef } from "react";
import { useSyncExternalStore } from "react";
import { TierLimitError, tierLimitToastContent } from "@scalepods/core";

export interface Toast {
  id: number;
  kind: "info" | "error" | "tier";
  title: string;
  message?: string;
  /** Rendered next to the toast when present (e.g. upgrade link). */
  action?: { label: string; href: string };
}

type Listener = () => void;

let toasts: Toast[] = [];
let listeners: Listener[] = [];
let nextId = 1;

function emit() {
  for (const l of listeners) l();
}

function push(toast: Omit<Toast, "id"> & { id?: number }): number {
  const t = { ...toast, id: toast.id ?? nextId++ };
  toasts = [...toasts, t].slice(-4);
  emit();
  return t.id;
}

export function showToast(input: Omit<Toast, "id"> & { id?: number }): number {
  return push(input);
}

export function showTierToast(err: TierLimitError): number {
  const content = tierLimitToastContent(err);
  return push({
    kind: "tier",
    title: content.title,
    message: content.message,
    action: { label: "Upgrade", href: "/billing" },
  });
}

export function showErrorToast(err: unknown): number {
  if (err instanceof TierLimitError) return showTierToast(err);
  const message = err instanceof Error ? err.message : "An unexpected error occurred.";
  return push({ kind: "error", title: "Something went wrong", message });
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function getToasts(): Toast[] {
  return toasts;
}

/** Prefer the hook in components; this keeps tests simple. */
export function subscribeToasts(listener: Listener): () => void {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribeToasts, getToasts, getToasts);
}

export function useDismiss(): (id: number) => void {
  return useCallback(dismissToast, []);
}

/** Imperative toast API usable from non-component code. */
export function useActionToast() {
  const ref = useRef({ showToast, showTierToast, showErrorToast });
  return ref.current;
}