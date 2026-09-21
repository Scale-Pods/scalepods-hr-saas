import { useCallback, useRef } from "react";
import { callWebhook, type WebhookRequest, type WebhookResponse } from "../lib/n8n";
import { currentAccessToken } from "./useAuth";
import { showErrorToast } from "./useToast";

/**
 * Wraps callWebhook for recruiter flows: attaches the session JWT and surfaces
 * every failure as a toast (402 -> tier toast with upgrade CTA) instead of raw
 * error handling per page.
 */
export function useN8nCall<T>() {
  const busyRef = useRef(false);

  const call = useCallback(
    async (
      path: string,
      req: Omit<WebhookRequest, "accessToken"> = {},
      opts?: { silent?: boolean }
    ): Promise<WebhookResponse<T> | null> => {
      let token: string | undefined;
      try {
        token = await currentAccessToken();
      } catch {
        token = undefined;
      }
      try {
        return await callWebhook<T>(path, { ...req, accessToken: token });
      } catch (err) {
        if (!opts?.silent) showErrorToast(err);
        return null;
      }
    },
    []
  );

  const callRaw = useCallback(
    async (
      path: string,
      req: Omit<WebhookRequest, "accessToken"> = {}
    ): Promise<WebhookResponse<T>> => callWebhook<T>(path, { ...req, accessToken: await currentAccessToken() }),
    []
  );

  return { call, callRaw, isBusy: busyRef };
}