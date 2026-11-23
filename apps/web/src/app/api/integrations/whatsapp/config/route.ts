import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const appId = process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID || "";
  const configId = process.env.META_CONFIG_ID || process.env.NEXT_PUBLIC_META_CONFIG_ID || "";
  const graphVersion = "v20.0";

  return NextResponse.json({
    app_id: appId,
    config_id: configId,
    graph_version: graphVersion,
    is_configured: Boolean(appId),
  });
}
