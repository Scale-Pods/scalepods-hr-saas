"use client";

import { useParams } from "next/navigation";
import { InterviewRoom } from "@/features/interview/components/InterviewRoom";
import { InterviewProvider } from "@/features/interview/context/InterviewContext";
import { ProctoringProvider } from "@/features/interview/context/ProctoringContext";

export default function CandidateInterviewConductPage() {
  const params = useParams();
  const sessionId = (params?.session_id as string) || "";

  return (
    <ProctoringProvider>
      <InterviewProvider>
        <InterviewRoom sessionId={sessionId} />
      </InterviewProvider>
    </ProctoringProvider>
  );
}
