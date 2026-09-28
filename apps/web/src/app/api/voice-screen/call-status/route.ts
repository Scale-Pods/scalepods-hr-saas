import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const phone = searchParams.get("phone");

    if (!phone) {
      return NextResponse.json({ calls: [] });
    }

    const cleanPhone = phone.replace(/[\s+-]/g, "");

    const res = await fetch("https://api.dialnexa.com/v1/calls", {
      headers: {
        Authorization:
          "Bearer rb0665oacdbt33:7f1d56728f43ab2e3274e928785d840e08457909852df246ae2cae0a8e2350c0",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ calls: [] });
    }

    const data = await res.json();
    const allCalls: Array<Record<string, unknown>> = Array.isArray(data)
      ? data
      : (data as { data?: Array<Record<string, unknown>> }).data || [];

    const matching = allCalls.filter((c) => {
      const toNumber = String(c.to_number || "").replace(/[\s+-]/g, "");
      return toNumber.includes(cleanPhone) || cleanPhone.includes(toNumber);
    });

    // Populate individual call details (including recording_sas_url) for top completed calls
    const calls = await Promise.all(
      matching.slice(0, 5).map(async (c) => {
        let recUrl = (c.recording_sas_url as string) || null;
        if (!recUrl && c.status === "completed" && c.id) {
          try {
            const detailRes = await fetch(`https://api.dialnexa.com/v1/calls/${c.id}`, {
              headers: {
                Authorization:
                  "Bearer rb0665oacdbt33:7f1d56728f43ab2e3274e928785d840e08457909852df246ae2cae0a8e2350c0",
              },
            });
            if (detailRes.ok) {
              const detail = (await detailRes.json()) as { recording_sas_url?: string };
              recUrl = detail.recording_sas_url || null;
            }
          } catch {}
        }

        const postAnalysis = (c.postcallanalysis as Record<string, unknown>) || {};

        return {
          id: c.id as string,
          duration: Number(c.duration || 0),
          status: (c.status as string) || "unknown",
          called_time: (c.called_time || c.initiated_time) as string | null,
          end_reason: (c.end_reason as string) || null,
          sentiment: (postAnalysis.sentiment as string) || null,
          call_successful: (postAnalysis.call_successful as string) || null,
          recording_url: recUrl,
        };
      }),
    );

    return NextResponse.json({
      success: true,
      calls,
    });
  } catch (err) {
    console.warn("Could not fetch DialNexa call status:", err);
    return NextResponse.json({ calls: [] });
  }
}
