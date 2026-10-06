import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];
    const startTime = searchParams.get("startTime") || "09:00";
    const endTime = searchParams.get("endTime") || "18:00";

    const payload = {
      window: {
        start: `${date}T${startTime}:00Z`,
        end: `${date}T${endTime}:00Z`,
      },
      blocked: [],
    };

    return NextResponse.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
