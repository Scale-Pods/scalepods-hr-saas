import { NextResponse } from "next/server";

// Deprecated: Lead capture is handled via direct WhatsApp chat (+91 98672 71848)
export async function POST() {
  return NextResponse.json(
    { message: "Lead capture via email is discontinued. Please connect directly via WhatsApp: https://wa.me/919867271848" },
    { status: 410 }
  );
}
