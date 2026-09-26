import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { config } from "dotenv";

config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://zqoafwrkkquicemuwfkb.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = "info@scalepods.co";
const password = "ScalePods@123";

// 1. Create user in auth.users (so Supabase forgot-password email works)
const { data: authData, error: authError } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: "ScalePods Admin" },
});

if (authError) {
  if (authError.message.includes("already exists")) {
    console.log("User already exists in auth.users:", email);
  } else {
    console.error("Error creating user in auth.users:", authError.message);
    process.exit(1);
  }
} else {
  console.log("User created in auth.users:", authData.user?.email);
}

// 2. Hash password and insert/update public.users
const salt = await bcrypt.genSalt(10);
const passwordHash = await bcrypt.hash(password, salt);

const { error: upsertError } = await supabase.from("users").upsert(
  {
    email,
    password_hash: passwordHash,
    full_name: "ScalePods Admin",
    created_at: new Date().toISOString(),
    passwords_changed_at: new Date().toISOString(),
  },
  { onConflict: "email" }
);

if (upsertError) {
  console.error("Error upserting public.users:", upsertError.message);
  process.exit(1);
} else {
  console.log("User inserted/updated in public.users with hashed password:", email);
}

console.log("Done.");
process.exit(0);
