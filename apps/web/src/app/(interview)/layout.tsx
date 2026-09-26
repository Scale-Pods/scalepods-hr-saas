import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Interview Room | ScalePods",
  description: "AI-guided interview session with real-time proctoring and assessment.",
};

export default function InterviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="interview-theme dark min-h-screen w-full bg-[#0d0e12] text-[#f5f5f7] overflow-x-hidden">
      {children}
    </div>
  );
}
