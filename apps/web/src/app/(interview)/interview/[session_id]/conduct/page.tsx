'use client';

import { useParams } from 'next/navigation';
import { ProctoringProvider } from '@/features/interview/context/ProctoringContext';
import { InterviewProvider } from '@/features/interview/context/InterviewContext';
import { InterviewRoom } from '@/features/interview/components/InterviewRoom';

export default function CandidateInterviewConductPage() {
  const params = useParams();
  const sessionId = (params?.session_id as string) || '';

  return (
    <ProctoringProvider>
      <InterviewProvider>
        <InterviewRoom sessionId={sessionId} />
      </InterviewProvider>
    </ProctoringProvider>
  );
}
