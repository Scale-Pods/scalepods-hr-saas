import nodePath from "node:path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: nodePath.resolve("./apps/web/.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

async function testUpdate() {
  console.log("Fetching campaigns...");
  const { data: campaigns, error: fetchError } = await supabase
    .from("campaigns")
    .select("*")
    .limit(1);

  if (fetchError) {
    console.error("Fetch error:", JSON.stringify(fetchError, null, 2));
    return;
  }
  if (!campaigns || campaigns.length === 0) {
    console.log("No campaigns found.");
    return;
  }

  const campaign = campaigns[0];
  console.log("Found campaign:", JSON.stringify(campaign, null, 2));

  const newStatus = campaign.status === "on" ? "off" : "on";
  console.log("Attempting to update status to:", newStatus);

  const { data, error } = await supabase
    .from("campaigns")
    .update({ status: newStatus })
    .eq("id", campaign.id)
    .select();

  if (error) {
    console.error("Update error object:", error);
    console.error("Update error JSON:", JSON.stringify(error, null, 2));
  } else {
    console.log("Update success:", JSON.stringify(data, null, 2));
  }
}

testUpdate();
