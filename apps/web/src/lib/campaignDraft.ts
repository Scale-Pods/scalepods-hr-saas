export const CAMPAIGN_DRAFT_KEY_PREFIX = "scalepods_campaign_wizard_draft";

export interface StoredCampaignDraft {
  accountId?: string;
  step?: number;
  name?: string;
  jdText?: string;
  location?: string;
  workArrangement?: "remote" | "hybrid" | "onsite";
  openingDate?: string;
  closingDate?: string;
  numberOfOpenings?: number | string;
  salaryMin?: string;
  salaryMax?: string;
  salaryCurrency?: string;
  salaryPeriod?: "annual" | "monthly" | "hourly";
  numberOfRounds?: number;
  startDate?: string;
  endDate?: string;
  rounds?: unknown[];
  whatsappOn?: boolean;
  dialnexaConfig?: unknown;
  customCadence?: unknown;
  savedAt?: number;
}

export function getCampaignDraftKey(accountId?: string | null): string {
  if (accountId?.trim()) {
    return `${CAMPAIGN_DRAFT_KEY_PREFIX}_${accountId.trim()}`;
  }
  return CAMPAIGN_DRAFT_KEY_PREFIX;
}

/**
 * Loads a campaign wizard draft scoped to the given account ID.
 * Guards against leaking drafts across different accounts on the same browser.
 */
export function loadCampaignDraft(accountId?: string | null): StoredCampaignDraft | null {
  if (typeof window === "undefined") return null;

  try {
    const scopedKey = getCampaignDraftKey(accountId);
    let raw = localStorage.getItem(scopedKey) || sessionStorage.getItem(scopedKey);

    // If scoped draft not found and accountId is provided, check legacy key with strict ownership guard
    if (!raw && accountId) {
      const legacyRaw =
        localStorage.getItem(CAMPAIGN_DRAFT_KEY_PREFIX) ||
        sessionStorage.getItem(CAMPAIGN_DRAFT_KEY_PREFIX);
      if (legacyRaw) {
        try {
          const parsedLegacy = JSON.parse(legacyRaw) as StoredCampaignDraft;
          // Only adopt legacy draft if it explicitly matches this account or has no account assigned yet
          if (!parsedLegacy.accountId || parsedLegacy.accountId === accountId) {
            raw = legacyRaw;
            // Migrate to scoped key and clean up legacy un-scoped entry
            saveCampaignDraft(accountId, parsedLegacy);
            clearLegacyDraft();
          } else {
            // Belongs to a different account - never leak it to this account!
            return null;
          }
        } catch {
          clearLegacyDraft();
        }
      }
    }

    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredCampaignDraft;
    // Strict account guard: if draft has an accountId, it must match the current accountId
    if (accountId && parsed.accountId && parsed.accountId !== accountId) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Saves a campaign wizard draft scoped to the given account ID.
 */
export function saveCampaignDraft(
  accountId: string | undefined | null,
  draft: StoredCampaignDraft,
): void {
  if (typeof window === "undefined") return;

  try {
    const scopedKey = getCampaignDraftKey(accountId);
    const payload = JSON.stringify({
      ...draft,
      accountId: accountId || draft.accountId,
      savedAt: Date.now(),
    });

    localStorage.setItem(scopedKey, payload);
    sessionStorage.setItem(scopedKey, payload);
  } catch {}
}

/**
 * Clears the campaign wizard draft for the given account.
 */
export function clearCampaignDraft(accountId?: string | null): void {
  if (typeof window === "undefined") return;

  try {
    const scopedKey = getCampaignDraftKey(accountId);
    localStorage.removeItem(scopedKey);
    sessionStorage.removeItem(scopedKey);

    // Also check legacy key
    const legacyRaw =
      localStorage.getItem(CAMPAIGN_DRAFT_KEY_PREFIX) ||
      sessionStorage.getItem(CAMPAIGN_DRAFT_KEY_PREFIX);
    if (legacyRaw) {
      try {
        const parsedLegacy = JSON.parse(legacyRaw) as StoredCampaignDraft;
        if (!parsedLegacy.accountId || !accountId || parsedLegacy.accountId === accountId) {
          clearLegacyDraft();
        }
      } catch {
        clearLegacyDraft();
      }
    }
  } catch {}
}

function clearLegacyDraft(): void {
  try {
    localStorage.removeItem(CAMPAIGN_DRAFT_KEY_PREFIX);
    sessionStorage.removeItem(CAMPAIGN_DRAFT_KEY_PREFIX);
  } catch {}
}
