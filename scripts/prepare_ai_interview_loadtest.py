import urllib.request
import json
import csv
import os
import uuid

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
    account_id = "a0cdba65-f070-4ce0-b17f-1fb47f73913e"
    campaign_id = "f69d32a5-9920-4658-aae9-947269cd08cf"
    candidate_id = "45abef3d-42e0-472e-ac97-91df9699c807"
    application_id = "a0c89def-243f-43d0-9320-4be3101b4564"

    print("Checking or creating AI Interview round instance...")
    existing_rounds = supabase_get(f"round_instances?campaign_id=eq.{campaign_id}&candidate_id=eq.{candidate_id}&round_type=eq.ai_interview")
    
    if existing_rounds:
        round_inst = existing_rounds[0]
        round_instance_id = round_inst["id"]
        print(f"Using existing AI Interview round instance: {round_instance_id}")
    else:
        new_round = {
            "account_id": account_id,
            "campaign_id": campaign_id,
            "candidate_id": candidate_id,
            "application_id": application_id,
            "round_number": 2,
            "round_type": "ai_interview",
            "status": "pending"
        }
        res = supabase_post("round_instances", [new_round])
        round_inst = res[0]
        round_instance_id = round_inst["id"]
        print(f"Created new AI Interview round instance: {round_instance_id}")

    # Check or create interview_session
    sessions = supabase_get(f"interview_sessions?round_instance_id=eq.{round_instance_id}")
    if sessions:
        session = sessions[0]
        session_id = session["id"]
        print(f"Using existing interview session: {session_id}")
    else:
        new_session = {
            "account_id": account_id,
            "candidate_id": candidate_id,
            "round_instance_id": round_instance_id,
            "status": "active",
            "expires_at": "2026-12-31T23:59:59Z"
        }
        res = supabase_post("interview_sessions", [new_session])
        session = res[0]
        session_id = session["id"]
        print(f"Created new interview session: {session_id}")

    # Check or create interview_questions
    questions = supabase_get(f"interview_questions?session_id=eq.{session_id}")
    if not questions:
        sample_questions = [
            {
                "session_id": session_id,
                "order_index": 1,
                "question_text": "Can you explain how you design and build automation workflows in n8n?",
                "question_type": "technical",
                "source": "generated"
            },
            {
                "session_id": session_id,
                "order_index": 2,
                "question_text": "Describe a challenging bug you encountered with a webhook or third-party API and how you resolved it.",
                "question_type": "problem_solving",
                "source": "generated"
            },
            {
                "session_id": session_id,
                "order_index": 3,
                "question_text": "How do you handle API rate limits and failures in an asynchronous worker architecture?",
                "question_type": "technical",
                "source": "generated"
            }
        ]
        questions = supabase_post("interview_questions", sample_questions)
        print(f"Created {len(questions)} interview questions.")
    else:
        print(f"Found {len(questions)} existing questions.")

    os.makedirs("jmeter", exist_ok=True)
    csv_file = "jmeter/ai_interview_test_data.csv"
    with open(csv_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["session_id", "question_id", "round_instance_id", "account_id", "candidate_id"])
        for q in questions:
            writer.writerow([session_id, q["id"], round_instance_id, account_id, candidate_id])

    print(f"\nAI Interview JMeter dataset exported to: {csv_file}")
    print(f"Session ID:  {session_id}")
    print(f"Question ID: {questions[0]['id']}")

if __name__ == "__main__":
    main()
