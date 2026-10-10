import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";

function localTimeToUtc(date: string, time: string, timeZone: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 3; i += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(guess)).map((p) => [p.type, p.value]),
    );
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    guess += target - represented;
  }
  return new Date(guess).toISOString();
}

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const roundInstanceId = params.get("riId") || "";
  const token = params.get("tok") || "";
  const date = params.get("date") || new Date().toISOString().slice(0, 10);
  const startTime = params.get("startTime") || "09:00";
  const endTime = params.get("endTime") || "18:00";
  const timeZone = params.get("tz") || "UTC";
  if (!roundInstanceId || !token) {
    return NextResponse.json({ error: "A valid booking link is required." }, { status: 400 });
  }
  let timeMin: string;
  let timeMax: string;
  try {
    timeMin = localTimeToUtc(date, startTime, timeZone);
    timeMax = localTimeToUtc(date, endTime, timeZone);
  } catch {
    return NextResponse.json(
      { error: "The requested timezone or time window is invalid." },
      { status: 400 },
    );
  }
  if (timeMax <= timeMin) {
    return NextResponse.json({ error: "The requested time window is invalid." }, { status: 400 });
  }

  try {
    const base = getEnv()
      .NEXT_PUBLIC_N8N_BASE_URL.replace(/\/+$/, "")
      .replace(/\/webhook\/?$/, "");
    const response = await fetch(`${base}/webhook/calendar/availability`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        round_instance_id: roundInstanceId,
        token,
        time_min: timeMin,
        time_max: timeMax,
      }),
    });
    const payload = await response
      .json()
      .catch(() => ({ error: "Calendar availability lookup failed." }));
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    console.error("[api/booking/slots] n8n availability failed:", error);
    return NextResponse.json(
      { error: "Calendar availability is temporarily unavailable." },
      { status: 502 },
    );
  }
}
