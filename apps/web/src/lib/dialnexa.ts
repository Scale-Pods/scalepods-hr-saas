export const DEFAULT_DIALNEXA_API_KEY =
  "rb0665oacdbt33:7f1d56728f43ab2e3274e928785d840e08457909852df246ae2cae0a8e2350c0";
export const DEFAULT_DIALNEXA_AGENT_ID = "agent_Lg812J59k27OXl";
export const DEFAULT_DIALNEXA_OUTBOUND_FROM_NUMBER = "+912264233051";
export const DEFAULT_DIALNEXA_PHONE_NUMBER_ID = "phn_0HMYGFLppLskmB";

/**
 * Normalizes any phone number (recipient or caller ID / from number) into E.164
 * format with a country code prefix (e.g. +912264233051).
 */
export function formatE164PhoneNumber(raw?: string | null, defaultIso = "91"): string {
  if (!raw || typeof raw !== "string") return "";
  const cleaned = raw.trim().replace(/[\s\-()]/g, "");
  if (!cleaned) return "";

  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  if (cleaned.startsWith("00")) {
    return `+${cleaned.slice(2)}`;
  }
  const cleanIso = defaultIso.replace(/^\+/, "");
  if (cleaned.startsWith(cleanIso) && cleaned.length > cleanIso.length + 6) {
    return `+${cleaned}`;
  }
  // Standard 10-digit number without country code
  if (cleaned.length === 10) {
    return `+${cleanIso}${cleaned}`;
  }
  return `+${cleanIso}${cleaned}`;
}

/**
 * Resolves the outbound caller ID / from number with an E.164 country code (+91).
 */
export function resolveOutboundFromNumber(
  customFrom?: string | null,
  agentOutboundNumbers?: Array<{ phone_number?: string; country_iso?: string; id?: string }>,
): { fromNumber: string; phoneNumberId?: string } {
  if (customFrom && typeof customFrom === "string" && customFrom.trim()) {
    return {
      fromNumber: formatE164PhoneNumber(customFrom),
    };
  }

  if (agentOutboundNumbers && agentOutboundNumbers.length > 0) {
    const first = agentOutboundNumbers[0];
    if (first?.phone_number) {
      const iso = first.country_iso || "91";
      return {
        fromNumber: formatE164PhoneNumber(first.phone_number, iso),
        phoneNumberId: first.id,
      };
    }
  }

  const envFrom = process.env.DIALNEXA_OUTBOUND_FROM_NUMBER;
  if (envFrom?.trim()) {
    return {
      fromNumber: formatE164PhoneNumber(envFrom),
      phoneNumberId: DEFAULT_DIALNEXA_PHONE_NUMBER_ID,
    };
  }

  return {
    fromNumber: DEFAULT_DIALNEXA_OUTBOUND_FROM_NUMBER,
    phoneNumberId: DEFAULT_DIALNEXA_PHONE_NUMBER_ID,
  };
}

/**
 * Maps ScalePods voice options and names to DialNexa voice IDs.
 */
export const DIALNEXA_VOICE_ID_MAP: Record<string, string> = {
  // Indian English & Hinglish (mapped to high-reliability ElevenLabs telephony voices)
  aditi: "voice_94226a7ff47a43", // Apsara/Aditi (ElevenLabs, female, Indian)
  rohan: "voice_4897321fb9ef4e", // Amit Gupta/Rohan (ElevenLabs, male, Indian)
  ananya: "voice_mfl4legvvrugxy", // Ananya (ElevenLabs, female, Indian)
  aarav: "voice_e031f06ade5049", // Raju/Aarav (ElevenLabs, male, Indian)
  priya: "voice_mol2pruwhpAXKK", // Noor/Priya (ElevenLabs, female, Indian)
  kabir: "voice_818d336ca3904c", // Viraj/Kabir (ElevenLabs, male, Indian)
  neerja: "voice_94226a7ff47a43", // Apsara/Neerja (ElevenLabs, female, Indian)
  vikram: "voice_4897321fb9ef4e", // Amit Gupta/Vikram (ElevenLabs, male, Indian)
  tara: "voice_mfl4lefxlt42jt", // Tara (ElevenLabs, female, Indian)
  anika: "voice_mfl4lefoa7t7zc", // Anika (ElevenLabs, female, Indian)
  maya: "voice_113c227072ad4a", // Maya (ElevenLabs, female, Indian)
  neha: "voice_mtjy6lyYLmNv0H", // Prajakta/Neha (ElevenLabs, female, Indian)
  kavya: "voice_mtjxyab95MAVkO", // Parnita/Kavya (ElevenLabs, female, Indian)
  manav: "voice_818d336ca3904c", // Viraj/Manav (ElevenLabs, male, Indian)
  dev: "voice_4897321fb9ef4e", // Vikram/Dev (ElevenLabs, male, Indian)
  nisha: "voice_94226a7ff47a43", // Apsara/Nisha (ElevenLabs, female, Indian)
  shalini: "voice_mol2pruwhpAXKK", // Noor/Shalini (ElevenLabs, female, Indian)
  prajakta: "voice_mtjy6lyYLmNv0H", // Prajakta (ElevenLabs, female, Indian)
  parnita: "voice_mtjxyab95MAVkO", // Parnita (ElevenLabs, female, Indian)
  yazhini: "voice_mtiyeiIqfZn5Pz", // Yazhini (ElevenLabs, female, Indian)
  noor: "voice_mol2pruwhpAXKK", // Noor (ElevenLabs, female, Indian)
  apsara: "voice_94226a7ff47a43", // Apsara (ElevenLabs, female)
  viraj: "voice_818d336ca3904c", // Viraj (ElevenLabs, male)
  raju: "voice_e031f06ade5049", // Raju (ElevenLabs, male, Indian)
  khushi: "voice_mgj02qi6r63zmy", // Khushi (ElevenLabs, female, Indian)

  // American English
  rachel: "voice_mfl4leee3j8ysj", // Chelsea/Rachel (ElevenLabs, female, American)
  sarah: "voice_mfl4leg5yi6v0g", // Hope/Sarah (ElevenLabs, female, American)
  adam: "voice_mfl4leg14bh4of", // Adam (ElevenLabs, male, American)
  brian: "voice_mfl4leg8y7do5t", // Brian (ElevenLabs, male, American)
  paul: "voice_mfl4legi7cwcj5", // Paul (ElevenLabs, male, American)
  andrew: "voice_mfl4lege6i1wmo", // Andrew (ElevenLabs, male, American)
  drew: "voice_mfl4lege6i1wmo", // Andrew/Drew (ElevenLabs, male, American)
  savvy: "voice_mt8ijd2OnBzF3c", // Savvy (ElevenLabs, female, American)
  chelsea: "voice_mfl4leee3j8ysj", // Chelsea (ElevenLabs, female, American)
  hope: "voice_mfl4leg5yi6v0g", // Hope (ElevenLabs, female, American)
  victoria: "voice_mfl4legqajn7vj", // Victoria (ElevenLabs, female, American)
  ryan: "voice_mfl4leglq0abrf", // Ryan (ElevenLabs, male, American)
  brad: "voice_mfl4leer7z5p9e", // Brad (ElevenLabs, male, American)
  nova: "voice_mfl4leee3j8ysj", // Nova (female, American)
  alloy: "voice_4897321fb9ef4e", // Alloy (neutral/clear, Indian/American)
  echo: "voice_mfl4leg14bh4of", // Echo (male, American)
  shimmer: "voice_94226a7ff47a43", // Shimmer (expressive female)
  nicole: "voice_mfl4leg5yi6v0g", // Nicole (female, American)

  // British English
  lucy: "voice_mfl4lef889jqu8", // Lucy (ElevenLabs, female, British)
  marcus: "voice_mt8ijdI5VUkm5I", // Marcus (ElevenLabs, male, British)
  archer: "voice_mfl4lef3nfna4n", // Archer (ElevenLabs, male, British)
  george: "voice_mt8ijdI5VUkm5I", // George (ElevenLabs, male, British)
  charlotte: "voice_mfl4lef889jqu8", // Charlotte (ElevenLabs, female, British)
  oliver: "voice_mt8ijdI5VUkm5I", // Oliver (ElevenLabs, male, British)
  alice: "voice_mfl4lef889jqu8", // Alice (ElevenLabs, female, British)

  // Australian English
  liam: "voice_mfl4leg8y7do5t", // Liam (ElevenLabs, male, Australian)
  matilda: "voice_mfl4leg5yi6v0g", // Matilda (ElevenLabs, female, Australian)
};

export function resolveDialnexaVoiceId(voice?: string): string | undefined {
  if (!voice || typeof voice !== "string") {
    return undefined;
  }
  const trimmed = voice.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("voice_")) return trimmed;

  const key = trimmed.toLowerCase();
  if (DIALNEXA_VOICE_ID_MAP[key]) return DIALNEXA_VOICE_ID_MAP[key];

  // Try partial match
  for (const [k, vId] of Object.entries(DIALNEXA_VOICE_ID_MAP)) {
    if (key.includes(k) || k.includes(key)) {
      return vId;
    }
  }

  return undefined;
}

export interface SyncDialnexaAgentParams {
  agent_id?: string;
  voice?: string;
  voice_id?: string;
  voice_speed?: number;
  voice_pitch?: number;
  voice_temperature?: number;
  prompt?: string;
  first_message?: string;
  response_eagerness?: number;
  responsiveness?: number;
  interruption_sensitivity?: number;
  max_duration_seconds?: number;
  end_call_on_silence_sec?: number;
  ambient_noise?: boolean;
  candidate_name?: string;
  role_title?: string;
  company_name?: string;
  job_description?: string;
  jd_text?: string;
  candidate_resume?: string;
  resume_text?: string;
  questions?: string[];
  evaluation_criteria?: string[];
  outbound_from_number?: string;
  from_phone_number?: string;
  from_number?: string;
  caller_id?: string;
}

export interface SyncDialnexaAgentResult {
  success: boolean;
  version_number?: number;
  outbound_from_number?: string;
  phone_number_id?: string;
  error?: string;
}

/**
 * Interpolates template variables in prompt and greeting.
 */
export function interpolateDialnexaVariables(
  template: string,
  vars: {
    candidate_name?: string;
    job_title?: string;
    company_name?: string;
    job_description?: string;
    candidate_resume?: string;
  },
): string {
  if (!template || typeof template !== "string") return "";
  return template
    .replace(/\{\{candidate_name\}\}/g, vars.candidate_name || "Candidate")
    .replace(/\{\{job_title\}\}/g, vars.job_title || "Open Position")
    .replace(/\{\{company_name\}\}/g, vars.company_name || "ScalePods")
    .replace(
      /\{\{job_description\}\}/g,
      vars.job_description || "Refer to requirements for this role.",
    )
    .replace(
      /\{\{candidate_resume\}\}/g,
      vars.candidate_resume || "Refer to candidate profile and qualifications.",
    );
}

/**
 * Synchronizes the agent prompt, greeting, selected voice, and conversation settings to DialNexa.
 * DialNexa requires updating the agent via PATCH /v1/agents/{agent_id} with is_published: true
 * so that outbound telephony places calls with the active voice and screening prompt.
 */
export async function syncDialnexaAgentConfig(
  params: SyncDialnexaAgentParams,
): Promise<SyncDialnexaAgentResult> {
  const agentId = params.agent_id || DEFAULT_DIALNEXA_AGENT_ID;
  const apiKey = process.env.DIALNEXA_API_KEY || DEFAULT_DIALNEXA_API_KEY;

  let outboundFromNumber = DEFAULT_DIALNEXA_OUTBOUND_FROM_NUMBER;
  let outboundPhoneNumberId = DEFAULT_DIALNEXA_PHONE_NUMBER_ID;

  try {
    // 1. Fetch current agent version number and published state
    let targetVersion = 13;
    try {
      const getRes = await fetch(`https://api.dialnexa.com/v1/agents/${agentId}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });
      if (getRes.ok && typeof getRes.json === "function") {
        const getData = (await getRes.json()) as {
          data?: {
            current_version_number?: number | string;
            current_version?: { version_number?: number | string; is_published?: boolean };
            versions?: Array<{ version_number?: number | string; is_published?: boolean }>;
            outbound_phone_numbers?: Array<{
              phone_number?: string;
              country_iso?: string;
              id?: string;
            }>;
          };
        };
        const currentVersionNum = Number(
          getData.data?.current_version_number ||
            getData.data?.current_version?.version_number ||
            13,
        );
        const versions = (getData.data?.versions || []) as Array<{
          version_number?: number | string;
          is_published?: boolean;
        }>;
        const unpublishedVersion = versions.find((v) => !v.is_published);
        if (unpublishedVersion?.version_number) {
          targetVersion = Number(unpublishedVersion.version_number);
        } else {
          const maxVersion =
            versions.length > 0
              ? Math.max(...versions.map((v) => Number(v.version_number) || 0))
              : currentVersionNum;
          targetVersion = Math.max(currentVersionNum, maxVersion + 1);
        }

        const agentNumbers = getData.data?.outbound_phone_numbers;
        if (Array.isArray(agentNumbers) && agentNumbers.length > 0) {
          const resolved = resolveOutboundFromNumber(
            params.outbound_from_number ||
              params.from_phone_number ||
              params.from_number ||
              params.caller_id,
            agentNumbers,
          );
          outboundFromNumber = resolved.fromNumber;
          if (resolved.phoneNumberId) {
            outboundPhoneNumberId = resolved.phoneNumberId;
          }
        }
      }
    } catch (getErr) {
      console.warn("Could not fetch current agent version, defaulting to version 13:", getErr);
    }

    // 2. Prepare dynamic variable-preserving greeting and prompt
    const company = params.company_name?.trim() || "ScalePods";
    const role = params.role_title?.trim() || "Open Position";

    let welcomeMsg = params.first_message?.trim() || "";
    if (!welcomeMsg) {
      welcomeMsg = `Hi {{candidate_name}}, this is Alex from ${company} calling regarding your application for the ${role} position. Do you have a few minutes for a brief screening conversation?`;
    } else {
      // Ensure candidate name is a dynamic variable template placeholder, never baked with a static name
      welcomeMsg = welcomeMsg
        .replace(/\b(Gandla Manish|Alex Morgan|Shubhodeep|John Doe)\b/gi, "{{candidate_name}}")
        .replace(/\{\{company_name\}\}/g, company)
        .replace(/\{\{job_title\}\}/g, role);
      if (
        !welcomeMsg.includes("{{candidate_name}}") &&
        !welcomeMsg.toLowerCase().includes("candidate")
      ) {
        welcomeMsg = `Hi {{candidate_name}}, ${welcomeMsg.replace(/^Hi\s*,?\s*/i, "")}`;
      }
    }

    let fullPrompt = params.prompt?.trim() || "";
    if (!fullPrompt) {
      fullPrompt = `You are Alex, an AI Talent Screener representing ${company} conducting a preliminary voice screening phone call with candidate {{candidate_name}} for the ${role} position.`;
    } else {
      fullPrompt = fullPrompt
        .replace(/\b(Gandla Manish|Alex Morgan|Shubhodeep|John Doe)\b/gi, "{{candidate_name}}")
        .replace(/\{\{company_name\}\}/g, company)
        .replace(/\{\{job_title\}\}/g, role);
    }

    if (params.job_description || params.jd_text) {
      const jd = (params.job_description || params.jd_text || "").trim();
      if (jd && !fullPrompt.includes(jd.slice(0, 40))) {
        fullPrompt += `\n\nRole & Job Description:\n${jd}`;
      }
    }

    if (params.questions && params.questions.length > 0) {
      const formattedQuestions = params.questions
        .filter((q) => Boolean(q?.trim()))
        .map((q, idx) => `${idx + 1}. ${q.trim()}`)
        .join("\n");
      if (formattedQuestions && !fullPrompt.includes(formattedQuestions.slice(0, 30))) {
        fullPrompt += `\n\nSpecific Interview Questions to ask the candidate:\n${formattedQuestions}`;
      }
    }

    if (params.evaluation_criteria && params.evaluation_criteria.length > 0) {
      const formattedCriteria = params.evaluation_criteria
        .filter((c) => Boolean(c?.trim()))
        .map((c) => `- ${c.trim()}`)
        .join("\n");
      if (formattedCriteria && !fullPrompt.includes(formattedCriteria.slice(0, 30))) {
        fullPrompt += `\n\nEvaluation Criteria to evaluate:\n${formattedCriteria}`;
      }
    }

    fullPrompt += `\n\nInstructions for Telephony Call:\n- Address the candidate warmly by their dynamic variable name {{candidate_name}}.\n- Keep all responses conversational, concise (1-2 sentences), and ask one question at a time.\n- Under no circumstances address the candidate as Gandla Manish unless their name is explicitly Gandla Manish.`;

    // 3. Resolve Voice ID
    const resolvedVoiceId =
      params.voice_id ||
      resolveDialnexaVoiceId(params.voice) ||
      DIALNEXA_VOICE_ID_MAP.aditi ||
      "voice_94226a7ff47a43";

    const buildPatchBody = (vNum: number): Record<string, unknown> => {
      const body: Record<string, unknown> = {
        version_number: vNum,
        is_published: true, // Must be published for DialNexa outbound calls to execute this prompt and voice
        voice_id: resolvedVoiceId,
        voice_model_id: "mfl4be3m9z3xd4", // Eleven Flash v2.5 model is required for DialNexa outbound telephony SIP audio streams
        prompt_text: fullPrompt,
        welcome_message: welcomeMsg,
        boost_dynamic_variables: true,
      };

      if (typeof params.voice_speed === "number" && params.voice_speed > 0) {
        body.voice_speed = params.voice_speed;
      }

      if (typeof params.voice_pitch === "number") {
        body.voice_pitch = params.voice_pitch;
      }

      if (typeof params.voice_temperature === "number" && params.voice_temperature > 0) {
        body.voice_temperature = params.voice_temperature;
      }

      if (typeof params.response_eagerness === "number") {
        body.response_eagerness = params.response_eagerness;
      }

      if (typeof params.responsiveness === "number") {
        body.responsiveness = params.responsiveness;
      }

      if (typeof params.interruption_sensitivity === "number") {
        body.interruption_sensitivity = params.interruption_sensitivity;
      }

      if (typeof params.max_duration_seconds === "number" && params.max_duration_seconds > 0) {
        body.max_call_duration_sec = params.max_duration_seconds;
      }

      if (typeof params.end_call_on_silence_sec === "number") {
        body.end_call_on_silence_sec = params.end_call_on_silence_sec;
      }

      if (typeof params.ambient_noise === "boolean") {
        body.ambient_noise = params.ambient_noise;
      }

      return body;
    };

    // 4. Send PATCH request to DialNexa (with retry on published version collision)
    let patchRes = await fetch(`https://api.dialnexa.com/v1/agents/${agentId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildPatchBody(targetVersion)),
    });

    let patchData: { message?: string; error?: string; data?: { id?: string } } = {};
    const parseRes = async (r: Response) => {
      try {
        return (await r.json()) as typeof patchData;
      } catch {
        return {};
      }
    };
    patchData = await parseRes(patchRes);

    // If 403 "cannot patch an already published agent version", bump version and retry
    let retries = 0;
    while (
      !patchRes.ok &&
      retries < 2 &&
      (patchRes.status === 403 || String(patchData.message).toLowerCase().includes("published"))
    ) {
      targetVersion += 1;
      retries += 1;
      patchRes = await fetch(`https://api.dialnexa.com/v1/agents/${agentId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPatchBody(targetVersion)),
      });
      patchData = await parseRes(patchRes);
    }

    if (!patchRes.ok) {
      const errMsg =
        patchData.message ||
        patchData.error ||
        `DialNexa PATCH failed with HTTP ${patchRes.status}`;
      console.warn("DialNexa agent sync warning:", errMsg);
      return {
        success: false,
        error: errMsg,
        outbound_from_number: outboundFromNumber,
        phone_number_id: outboundPhoneNumberId,
      };
    }

    return {
      success: true,
      version_number: targetVersion,
      outbound_from_number: outboundFromNumber,
      phone_number_id: outboundPhoneNumberId,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn("DialNexa agent sync exception:", errMsg);
    return {
      success: false,
      error: errMsg,
      outbound_from_number: outboundFromNumber,
      phone_number_id: outboundPhoneNumberId,
    };
  }
}
