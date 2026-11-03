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
  // Indian English & Hinglish
  aditi: "voice_mfgsys96smn4c7", // Aditi (SmallestAI, female, Indian)
  rohan: "voice_18662c83888c43", // Rohan (SmallestAI, male, Indian)
  ananya: "voice_mfl4legvvrugxy", // Ananya (ElevenLabs, female, Indian)
  aarav: "voice_2f4c1b31555b44", // Aarav (Soniox, male, Indian)
  priya: "voice_4f1cea5ad4dc43", // Priya (SmallestAI, female, Indian)
  kabir: "voice_b8aab06c476e46", // Dev/Kabir (Soniox, male, Indian)
  neerja: "voice_3f8842f6fcda49", // Nisha/Neerja (Soniox, female, Indian)
  vikram: "voice_4897321fb9ef4e", // Amit Gupta/Vikram (ElevenLabs, male, Indian)
  tara: "voice_mfl4lefxlt42jt", // Tara (ElevenLabs, female, Indian)
  anika: "voice_mfl4lefoa7t7zc", // Anika (ElevenLabs, female, Indian)
  maya: "voice_113c227072ad4a", // Maya (ElevenLabs, female, Indian)
  neha: "voice_f1f2fc7355d34c", // Neha (Cartesia, female, Indian)
  kavya: "voice_114759d061544c", // Kavya (Cartesia, female, Indian)
  manav: "voice_4dac547a55634e", // Manav (Soniox, male, Indian)
  dev: "voice_b8aab06c476e46", // Dev (Soniox, male, Indian)
  nisha: "voice_3f8842f6fcda49", // Nisha (Soniox, female, Indian)
  shalini: "voice_9cd6a2e9b82a4e", // Shalini (Soniox, female, Indian)
  sunny: "voice_40963643c0c344", // Sunny (Sarvam, male, Indian)
  aayan: "voice_6c3acdcf089f40", // Aayan (Sarvam, male, Indian)
  roopa: "voice_80c0b38c000040", // Roopa (Sarvam, female, Indian)
  ashutosh: "voice_9ff5a124b49445", // Ashutosh (Sarvam, male, Indian)
  ritu: "voice_cb8802f06d9f41", // Ritu (Sarvam, female, Indian)
  prajakta: "voice_mtjy6lyYLmNv0H", // Prajakta (ElevenLabs, female, Indian)
  parnita: "voice_mtjxyab95MAVkO", // Parnita (ElevenLabs, female, Indian)
  yazhini: "voice_mtiyeiIqfZn5Pz", // Yazhini (ElevenLabs, female, Indian)
  ramya: "voice_0726074d3c624a", // Ramya (Cartesia, female, Indian)
  noor: "voice_mol2pruwhpAXKK", // Noor (ElevenLabs, female, Indian)
  apsara: "voice_94226a7ff47a43", // Apsara (ElevenLabs, female)
  viraj: "voice_818d336ca3904c", // Viraj (ElevenLabs, male)
  raju: "voice_e031f06ade5049", // Raju (ElevenLabs, male, Indian)
  krishna: "voice_1f1980d824a341", // Krishna (Cartesia, male, Indian)
  aarti: "voice_42d185eb32b649", // Aarti (Cartesia, female, Indian)
  ayush: "voice_dc0888f1f01c48", // Ayush (Cartesia, male, Indian)
  meera: "voice_9de03a1a4ffa40", // Meera (SmallestAI, female, Indian)
  khushi: "voice_mgj02qi6r63zmy", // Khushi (ElevenLabs, female, Indian)
  karan: "voice_mfgsys91vawc0m", // Karan (SmallestAI, male, Indian)
  dhruv: "voice_mfgsys938i0w8k", // Dhruv (SmallestAI, male, Indian)
  chirag: "voice_mfgsys8z3ylhzc", // Chirag (SmallestAI, male, Indian)

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

  // British English
  lucy: "voice_mfl4lef889jqu8", // Lucy (ElevenLabs, female, British)
  marcus: "voice_mt8ijdI5VUkm5I", // Marcus (ElevenLabs, male, British)
  archer: "voice_mfl4lef3nfna4n", // Archer (ElevenLabs, male, British)
};

export function resolveDialnexaVoiceId(voice?: string): string | undefined {
  if (!voice || typeof voice !== "string") return undefined;
  const trimmed = voice.trim();
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
          targetVersion = currentVersionNum;
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

    // 2. Interpolate dynamic variables
    const vars = {
      candidate_name: params.candidate_name || "Candidate",
      job_title: params.role_title || "Open Position",
      company_name: params.company_name || "ScalePods",
      job_description:
        params.job_description || params.jd_text || "Refer to requirements for this role.",
      candidate_resume:
        params.candidate_resume ||
        params.resume_text ||
        "Refer to candidate profile and qualifications.",
    };

    let fullPrompt = params.prompt || "";
    if (params.questions && params.questions.length > 0) {
      const formattedQuestions = params.questions
        .filter((q) => Boolean(q?.trim()))
        .map((q, idx) => `${idx + 1}. ${q.trim()}`)
        .join("\n");
      if (formattedQuestions) {
        fullPrompt += `\n\nSpecific Interview Questions to ask the candidate:\n${formattedQuestions}`;
      }
    }
    if (params.evaluation_criteria && params.evaluation_criteria.length > 0) {
      const formattedCriteria = params.evaluation_criteria
        .filter((c) => Boolean(c?.trim()))
        .map((c) => `- ${c.trim()}`)
        .join("\n");
      if (formattedCriteria) {
        fullPrompt += `\n\nEvaluation Criteria to evaluate:\n${formattedCriteria}`;
      }
    }

    // 3. Resolve Voice ID
    const resolvedVoiceId = params.voice_id || resolveDialnexaVoiceId(params.voice);

    const buildPatchBody = (vNum: number): Record<string, unknown> => {
      const body: Record<string, unknown> = {
        version_number: vNum,
        is_published: true, // Must be published for DialNexa outbound calls to execute this prompt and voice
      };

      if (resolvedVoiceId) {
        body.voice_id = resolvedVoiceId;
      }

      if (typeof params.voice_speed === "number" && params.voice_speed > 0) {
        body.voice_speed = params.voice_speed;
      }

      if (typeof params.voice_pitch === "number") {
        body.voice_pitch = params.voice_pitch;
      }

      if (typeof params.voice_temperature === "number" && params.voice_temperature > 0) {
        body.voice_temperature = params.voice_temperature;
      }

      if (fullPrompt) {
        body.prompt_text = interpolateDialnexaVariables(fullPrompt, vars);
      }

      if (params.first_message) {
        body.welcome_message = interpolateDialnexaVariables(params.first_message, vars);
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

    // If 403 "cannot patch an already published agent version", bump version and retry once
    if (
      !patchRes.ok &&
      (patchRes.status === 403 || String(patchData.message).toLowerCase().includes("published"))
    ) {
      targetVersion += 1;
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
