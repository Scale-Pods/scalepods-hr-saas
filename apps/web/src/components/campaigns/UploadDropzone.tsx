"use client";

import { unzip } from "fflate";
import { FileText, Upload, X } from "lucide-react";
import { type DragEvent, useCallback, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type DropFileStatus = "idle" | "uploading" | "screening" | "done" | "rejected" | "error";

export interface DropFile {
  file: File;
  status: DropFileStatus;
  note?: string;
  email?: string;
  name?: string;
  phone?: string;
  score?: number | null;
}

const ACCEPTED_RESUME = /\.(pdf|docx?|txt)$/i;
const ZIP_EXT = /\.zip$/i;

/** Unzip a dropped ZIP and return the contained resume files as real File objects. */
async function unzipResumes(zip: File): Promise<File[]> {
  const buffer = await zip.arrayBuffer();
  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(new Uint8Array(buffer), (err, data) => (err ? reject(err) : resolve(data)));
  });
  const files: File[] = [];
  for (const [path, bytes] of Object.entries(entries)) {
    const name = path.split(/[\\/]/).pop() || path;
    if (name.startsWith(".") || !ACCEPTED_RESUME.test(name)) continue;
    const type =
      ACCEPTED_RESUME.test(name) && !/\.txt$/i.test(name)
        ? /\.docx?$/i.test(name)
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/pdf"
        : "text/plain";
    files.push(new File([bytes], name, { type }));
  }
  return files;
}

export function UploadDropzone({
  files,
  onFiles,
  onRemove,
  accept,
  multiple = true,
  disabled,
}: {
  files: DropFile[];
  onFiles: (next: DropFile[]) => void;
  onRemove: (index: number) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const addFiles = useCallback(
    async (list: FileList | File[]) => {
      const next: DropFile[] = [];
      for (const file of Array.from(list)) {
        if (ZIP_EXT.test(file.name)) {
          try {
            const extracted = await unzipResumes(file);
            if (extracted.length === 0) {
              next.push({ file, status: "rejected", note: "No PDF/DOCX found in ZIP" });
            } else {
              next.push(...extracted.map((f): DropFile => ({ file: f, status: "idle" })));
            }
          } catch {
            next.push({ file, status: "rejected", note: "Could not read ZIP file" });
          }
        } else {
          next.push({ file, status: "idle" });
        }
      }
      if (multiple) onFiles([...files, ...next]);
      else onFiles(next);
    },
    [files, multiple, onFiles],
  );

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  return (
    <div>
      <label
        htmlFor={inputId}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable dropzone with a key handler
        tabIndex={0}
        aria-label="Upload files"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-[20px] border border-dashed border-separator bg-fill-quaternary/60 px-4 py-8 text-center transition-colors hover:bg-fill-quaternary",
          dragging && "border-primary bg-fill-quaternary",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <Upload className="mb-2 h-6 w-6 text-label-tertiary" aria-hidden />
        <p className="text-sm font-medium text-foreground">Drop resumes here or click to browse</p>
        <p className="mt-1 text-xs text-label-secondary">
          PDF or DOCX (one per candidate) — or a ZIP containing many
        </p>
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={accept ?? ".pdf,.doc,.docx,.txt,.zip"}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((f, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: same filename may be dropped twice
            <li key={`${f.file.name}-${i}`}>
              <FileRow f={f} onRemove={() => onRemove(i)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FileRow({ f, onRemove }: { f: DropFile; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-separator/60 bg-fill-quaternary/50 px-3 py-2">
      <FileText className="h-4 w-4 shrink-0 text-label-secondary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{f.file.name}</p>
        {f.email && <p className="truncate text-xs text-label-secondary">{f.email}</p>}
      </div>
      {f.note && (
        <span
          className={cn(
            "text-xs",
            f.status === "error" ? "text-destructive" : "text-label-secondary",
          )}
        >
          {f.note}
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${f.file.name}`}
        className="rounded p-1 text-label-secondary hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
