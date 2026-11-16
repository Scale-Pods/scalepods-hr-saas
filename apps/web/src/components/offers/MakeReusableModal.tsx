"use client";

import { AlertCircle, Check, HelpCircle, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeFieldName, type TextMatchItem } from "@/lib/offers/make-reusable";

export interface MakeReusableModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  templateName: string;
  accessToken?: string;
  onSuccess: (newTemplate: {
    id: string;
    name: string;
    file_name: string;
    storage_path: string;
    variables: string[];
    placeholders: string[];
    is_finished_letter: boolean;
  }) => void;
}

interface MappingPair {
  id: string;
  targetText: string;
  fieldName: string;
  matches: TextMatchItem[];
  selectedMatchIds: Set<string>;
  loadingMatches: boolean;
  hasSearched: boolean;
}

export function MakeReusableModal({
  open,
  onOpenChange,
  templateId,
  templateName,
  accessToken,
  onSuccess,
}: MakeReusableModalProps) {
  const [pairs, setPairs] = useState<MappingPair[]>([
    {
      id: "pair-1",
      targetText: "",
      fieldName: "",
      matches: [],
      selectedMatchIds: new Set(),
      loadingMatches: false,
      hasSearched: false,
    },
  ]);

  const [loadingAi, setLoadingAi] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showAiNotice, setShowAiNotice] = useState(false);

  const getHeaders = useCallback(() => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return headers;
  }, [accessToken]);

  // Scan matches for a specific pair
  const scanMatchesForPair = useCallback(
    async (pairIndex: number, textToScan?: string) => {
      const pair = pairs[pairIndex];
      const text = (textToScan ?? pair.targetText).trim();
      if (!text) return;

      setPairs((prev) =>
        prev.map((p, idx) => (idx === pairIndex ? { ...p, loadingMatches: true } : p)),
      );

      try {
        const res = await fetch("/api/offer-templates/matches", {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({
            template_id: templateId,
            target_texts: [text],
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to scan document for matches");
        }

        const data = (await res.json()) as { matches: Record<string, TextMatchItem[]> };
        const found = data.matches[text] || [];

        setPairs((prev) =>
          prev.map((p, idx) => {
            if (idx !== pairIndex) return p;
            const matchIds = new Set(found.map((m) => m.id));
            return {
              ...p,
              matches: found,
              selectedMatchIds: matchIds,
              loadingMatches: false,
              hasSearched: true,
            };
          }),
        );
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : String(err));
        setPairs((prev) =>
          prev.map((p, idx) => (idx === pairIndex ? { ...p, loadingMatches: false } : p)),
        );
      }
    },
    [pairs, templateId, getHeaders],
  );

  // Trigger AI suggestions
  const handleRequestAiSuggestions = async () => {
    setLoadingAi(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/offer-templates/suggest-fields", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ template_id: templateId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate AI suggestions");
      }

      const data = (await res.json()) as {
        suggestions: Array<{ text: string; suggested_field: string; reason: string }>;
      };

      if (!data.suggestions || data.suggestions.length === 0) {
        setErrorMessage("AI did not find any obvious candidate-specific values in this document.");
        return;
      }

      // Convert suggestions to pairs and fetch their matches in one batch
      const texts = data.suggestions.map((s) => s.text);
      const matchRes = await fetch("/api/offer-templates/matches", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          template_id: templateId,
          target_texts: texts,
        }),
      });

      const matchData = (await matchRes.json().catch(() => ({ matches: {} }))) as {
        matches: Record<string, TextMatchItem[]>;
      };

      const newPairs: MappingPair[] = data.suggestions.map((s, idx) => {
        const found = matchData.matches[s.text] || [];
        return {
          id: `ai-${idx}-${Date.now()}`,
          targetText: s.text,
          fieldName: normalizeFieldName(s.suggested_field),
          matches: found,
          selectedMatchIds: new Set(found.map((m) => m.id)),
          loadingMatches: false,
          hasSearched: true,
        };
      });

      setPairs(newPairs);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingAi(false);
    }
  };

  const addPair = () => {
    setPairs((prev) => [
      ...prev,
      {
        id: `pair-${Date.now()}`,
        targetText: "",
        fieldName: "",
        matches: [],
        selectedMatchIds: new Set(),
        loadingMatches: false,
        hasSearched: false,
      },
    ]);
  };

  const removePair = (index: number) => {
    setPairs((prev) => prev.filter((_, idx) => idx !== index));
  };

  const toggleMatchSelection = (pairIndex: number, matchId: string) => {
    setPairs((prev) =>
      prev.map((p, idx) => {
        if (idx !== pairIndex) return p;
        const newSet = new Set(p.selectedMatchIds);
        if (newSet.has(matchId)) newSet.delete(matchId);
        else newSet.add(matchId);
        return { ...p, selectedMatchIds: newSet };
      }),
    );
  };

  const handleCreateTemplate = async () => {
    setErrorMessage(null);

    // Validation
    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i];
      if (!p.targetText.trim()) {
        setErrorMessage(`Pair #${i + 1} has an empty target text.`);
        return;
      }
      if (!p.fieldName.trim()) {
        setErrorMessage(`Pair #${i + 1} is missing a placeholder field name.`);
        return;
      }
      if (p.hasSearched && p.matches.length === 0) {
        setErrorMessage(`Pair #${i + 1} ("${p.targetText}") has 0 matches in the document.`);
        return;
      }
      if (p.selectedMatchIds.size === 0) {
        setErrorMessage(`Pair #${i + 1} has no matches selected for replacement.`);
        return;
      }
    }

    setSubmitting(true);

    try {
      const replacements: Array<{ matchId: string; fieldName: string }> = [];
      const targetMatches: Record<string, TextMatchItem[]> = {};

      for (const p of pairs) {
        targetMatches[p.targetText] = p.matches;
        for (const matchId of p.selectedMatchIds) {
          replacements.push({
            matchId,
            fieldName: normalizeFieldName(p.fieldName),
          });
        }
      }

      const res = await fetch("/api/offer-templates/make-reusable", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          source_template_id: templateId,
          name: `${templateName} (Reusable Template)`,
          replacements,
          target_matches: targetMatches,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create reusable template");
      }

      const result = await res.json();
      onSuccess(result.template);
      onOpenChange(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-6 bg-slate-950 text-slate-100 border-slate-800">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            Make Finished Letter Reusable
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-400">
            Replace candidate-specific values in{" "}
            <span className="font-medium text-slate-200">"{templateName}"</span> with fillable
            placeholders. Formatting, fonts, tables, and spacing are 100% preserved.
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-950/60 border border-red-800 text-red-200 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">{errorMessage}</div>
          </div>
        )}

        <div className="flex items-center justify-between py-2 border-b border-slate-800">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRequestAiSuggestions}
            disabled={loadingAi}
            className="border-indigo-600/50 bg-indigo-950/30 hover:bg-indigo-900/40 text-indigo-300 gap-1.5"
          >
            {loadingAi ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Suggest Fields with AI
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAiNotice(!showAiNotice)}
            className="text-xs text-slate-400 hover:text-slate-300 gap-1"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            AI Privacy Notice
          </Button>
        </div>

        {showAiNotice && (
          <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg text-xs text-slate-300 space-y-1">
            <p className="font-semibold text-slate-200">Privacy & Data Handling Notice:</p>
            <p>
              When you click "Suggest Fields with AI", document text is processed by Anthropic
              Claude solely to detect candidate values. No letter text is stored or logged on our
              servers, and suggestions only pre-fill this wizard for your manual review.
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
          {pairs.map((pair, pIdx) => (
            <div
              key={pair.id}
              className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Field #{pIdx + 1}
                </span>
                {pairs.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removePair(pIdx)}
                    className="h-7 w-7 p-0 text-slate-400 hover:text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Exact text in letter</Label>
                  <div className="flex gap-1.5">
                    <Input
                      value={pair.targetText}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPairs((prev) =>
                          prev.map((p, i) =>
                            i === pIdx ? { ...p, targetText: val, hasSearched: false } : p,
                          ),
                        );
                      }}
                      onBlur={() => scanMatchesForPair(pIdx)}
                      placeholder='e.g. "Rahul Sharma" or "18,00,000"'
                      className="bg-slate-950 border-slate-700 text-sm h-9"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => scanMatchesForPair(pIdx)}
                      disabled={pair.loadingMatches || !pair.targetText.trim()}
                      className="h-9 px-3 shrink-0"
                    >
                      {pair.loadingMatches ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        "Find"
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Placeholder Field Name</Label>
                  <Input
                    value={pair.fieldName}
                    onChange={(e) => {
                      const val = normalizeFieldName(e.target.value);
                      setPairs((prev) =>
                        prev.map((p, i) => (i === pIdx ? { ...p, fieldName: val } : p)),
                      );
                    }}
                    placeholder="e.g. candidate_name"
                    className="bg-slate-950 border-slate-700 text-sm h-9 font-mono"
                  />
                </div>
              </div>

              {pair.hasSearched && (
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      Matches Found:{" "}
                      <Badge
                        variant={pair.matches.length > 0 ? "secondary" : "destructive"}
                        className="ml-1"
                      >
                        {pair.matches.length}
                      </Badge>
                    </span>
                    {pair.matches.length > 0 && (
                      <span className="text-slate-400">
                        {pair.selectedMatchIds.size} of {pair.matches.length} selected
                      </span>
                    )}
                  </div>

                  {pair.matches.length === 0 ? (
                    <p className="text-xs text-amber-400">
                      Zero matches found. Please ensure the target text matches verbatim with the
                      letter.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {pair.matches.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center gap-2.5 p-2 rounded bg-slate-950/70 border border-slate-800 text-xs"
                        >
                          <Checkbox
                            id={m.id}
                            checked={pair.selectedMatchIds.has(m.id)}
                            onCheckedChange={() => toggleMatchSelection(pIdx, m.id)}
                          />
                          <label
                            htmlFor={m.id}
                            className="flex-1 font-mono text-slate-300 cursor-pointer truncate"
                          >
                            ...{m.contextSnippet}...
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addPair}
            className="w-full border-dashed border-slate-700 hover:border-slate-500 text-slate-300 gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Another Field Replacement
          </Button>
        </div>

        <DialogFooter className="pt-3 border-t border-slate-800 flex justify-between items-center sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="text-slate-400"
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={handleCreateTemplate}
            disabled={submitting || pairs.length === 0}
            className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Converting Template...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Create Reusable Template
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
