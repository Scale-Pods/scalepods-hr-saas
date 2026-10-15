import urllib.request
import json
import csv
import uuid
import os

SUPABASE_URL = "https://inkfjgmnxkfitnegpiej.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlua2ZqZ21ueGtmaXRuZWdwaWVqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTc0NDk0OSwiZXhwIjoyMTA1MzIwOTQ5fQ.QRGlz9U_n1wo7MfXTYobhK15sfRVcWOYXONaO6Zrd54"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

def supabase_get(endpoint):
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def supabase_post(endpoint, data):
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}"
    req = urllib.request.Request(url, data=json.dumps(data).encode(), headers=HEADERS)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def main():
    print("Fetching active account and campaign...")
    accounts = supabase_get("accounts?select=id,name,email&limit=1")
    if not accounts:
        print("No accounts found in Supabase!")
        return
    account = accounts[0]
    account_id = account["id"]
    print(f"Using Account: {account['name']} ({account_id})")

    campaigns = supabase_get(f"campaigns?account_id=eq.{account_id}&status=eq.open&limit=1")
    if not campaigns:
        campaigns = supabase_get("campaigns?limit=1")
    if not campaigns:
        print("No campaigns found!")
        return
    campaign = campaigns[0]
    campaign_id = campaign["id"]
    print(f"Using Campaign: {campaign['name']} ({campaign_id})")

    # Fetch existing applications and round instances
    apps = supabase_get(f"applications?campaign_id=eq.{campaign_id}&limit=50")
    print(f"Found {len(apps)} existing applications for this campaign.")

    rounds = supabase_get(f"round_instances?campaign_id=eq.{campaign_id}&limit=50")
    print(f"Found {len(rounds)} existing round instances.")

    os.makedirs("jmeter", exist_ok=True)
    csv_file = "jmeter/test_data.csv"

    with open(csv_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["account_id", "campaign_id", "application_id", "candidate_id", "round_instance_id", "candidate_email"])

        if apps:
            for i, a in enumerate(apps):
                app_id = a.get("id", "")
                cand_id = a.get("candidate_id", "")
                r_id = rounds[i]["id"] if i < len(rounds) else (rounds[0]["id"] if rounds else "")
                cand_email = a.get("candidate_email", f"test-{i}@example.com")
                writer.writerow([account_id, campaign_id, app_id, cand_id, r_id, cand_email])
        else:
            # Fallback if no applications exist yet
            writer.writerow([account_id, campaign_id, "", "", "", "test@example.com"])

    print(f"\nCreated JMeter test dataset at: {csv_file}")
    print(f"Summary:")
    print(f"  account_id:        {account_id}")
    print(f"  campaign_id:       {campaign_id}")
    if apps:
        print(f"  Sample app_id:     {apps[0]['id']}")
    if rounds:
        print(f"  Sample round_id:   {rounds[0]['id']}")

if __name__ == "__main__":
    main()
