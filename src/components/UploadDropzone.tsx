import {
  useCallback,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { FileText, Upload, X } from "lucide-react";
import { cn } from "../lib/cn";

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

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      const next = Array.from(list).map((file): DropFile => ({ file, status: "idle" }));
      if (multiple) onFiles([...files, ...next]);
      else onFiles(next);
    },
    [files, multiple, onFiles]
  );

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload files"
        onClick={() => !disabled && inputRef.current?.click()}
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
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
          dragging ? "border-primary bg-accent" : "border-input bg-card",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <Upload className="mb-2 h-6 w-6 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-foreground">
          Drop resumes here or click to browse
        </p>
        <p className="mt-1 text-xs text-muted-foreground">PDF or DOCX · one file per candidate</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept ?? ".pdf,.doc,.docx,.txt"}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((f, i) => (
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
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{f.file.name}</p>
        {f.email && <p className="truncate text-xs text-muted-foreground">{f.email}</p>}
      </div>
      {f.note && <span className={cn("text-xs", f.status === "error" ? "text-destructive" : "text-muted-foreground")}>{f.note}</span>}
      <button
        onClick={onRemove}
        aria-label={`Remove ${f.file.name}`}
        className="rounded p-1 text-muted-foreground hover:text-muted-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}