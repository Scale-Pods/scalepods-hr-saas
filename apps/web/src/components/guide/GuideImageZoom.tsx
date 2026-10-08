"use client";

import { Maximize2, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

interface GuideImageZoomProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
}

export function GuideImageZoom({ src, alt, width, height, priority = false }: GuideImageZoomProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  return (
    <>
      <div className="group relative mt-3 block w-full overflow-hidden rounded-xl border border-[#232c47] bg-[#141b30] shadow-[0_10px_35px_rgba(0,0,0,0.45)] transition-all hover:border-[#2f6bff]/50">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="block w-full text-left cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f6bff]"
          aria-label={`Enlarge screenshot: ${alt}`}
        >
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            priority={priority}
            sizes="(max-width: 960px) 100vw, 960px"
            className="w-full h-auto transition-transform duration-200 group-hover:scale-[1.005]"
          />
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-lg border border-[#232c47] bg-[#0b1020]/80 px-2.5 py-1 text-xs font-medium text-[#cbd5ea] backdrop-blur-md opacity-90 transition-opacity group-hover:opacity-100 group-hover:border-[#2f6bff]/50">
            <Maximize2 className="h-3 w-3 text-[#60a5fa]" aria-hidden="true" />
            <span>Click to enlarge</span>
          </div>
        </button>
      </div>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-150"
        >
          {/* Backdrop button to close */}
          <button
            type="button"
            className="fixed inset-0 bg-black/85 backdrop-blur-md cursor-default border-none p-0 w-full h-full"
            onClick={() => setIsOpen(false)}
            aria-label="Close enlarged screenshot overlay"
          />

          {/* Modal Content */}
          <div className="relative z-10 max-h-[92vh] max-w-[94vw] overflow-auto rounded-xl border border-[#232c47] bg-[#0b1020] shadow-2xl p-1">
            <div className="flex items-center justify-between border-b border-[#232c47] px-4 py-2.5 bg-[#141b30]/80">
              <p className="text-xs font-medium text-[#cbd5ea] truncate max-w-[70vw]">{alt}</p>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1 text-[#9aa6bf] hover:bg-[#232c47] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f6bff]"
                aria-label="Close enlarged screenshot"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-2">
              <Image
                src={src}
                alt={alt}
                width={width}
                height={height}
                sizes="95vw"
                className="max-h-[82vh] w-auto h-auto rounded-lg object-contain mx-auto"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
