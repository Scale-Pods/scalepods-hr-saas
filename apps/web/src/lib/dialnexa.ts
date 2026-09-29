export const DEFAULT_DIALNEXA_API_KEY =
  "rb0665oacdbt33:7f1d56728f43ab2e3274e928785d840e08457909852df246ae2cae0a8e2350c0";
export const DEFAULT_DIALNEXA_AGENT_ID = "agent_Lg812J59k27OXl";

export interface SyncDialnexaAgentParams {
  agent_id?: string;
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
}

/**
 * Interpolates template variables in prompt and greeting.
 */
export function interpolateDialnexaVariables(
  template: string,
  vars: { candidate_name?: string; job_title?: string; company_name?: string },
): string {
  if (!template || typeof template !== "string") return "";
  return template
    .replace(/\{\{candidate_name\}\}/g, vars.candidate_name || "Candidate")
    .replace(/\{\{job_title\}\}/g, vars.job_title || "Open Position")
    .replace(/\{\{company_name\}\}/g, vars.company_name || "ScalePods");
}

/**
 * Synchronizes the agent prompt, greeting, and conversation settings to DialNexa.
 * DialNexa requires updating the agent via PATCH /v1/agents/{agent_id} before dispatching calls
 * so that the outbound telephony engine runs the custom screening prompt.
 */
export async function syncDialnexaAgentConfig(
  params: SyncDialnexaAgentParams,
): Promise<{ success: boolean; version_number?: number; error?: string }> {
  const agentId = params.agent_id || DEFAULT_DIALNEXA_AGENT_ID;
  const apiKey = process.env.DIALNEXA_API_KEY || DEFAULT_DIALNEXA_API_KEY;

  try {
    // 1. Fetch current agent version number
    let currentVersion = 13;
    try {
      const getRes = await fetch(`https://api.dialnexa.com/v1/agents/${agentId}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });
      if (getRes.ok && typeof getRes.json === "function") {
        const getData = (await getRes.json()) as {
          data?: {
            current_version_number?: number;
            current_version?: { version_number?: number };
          };
        };
        currentVersion =
          getData.data?.current_version_number ||
          getData.data?.current_version?.version_number ||
          13;
      }
    } catch (getErr) {
      console.warn("Could not fetch current agent version, defaulting to version 13:", getErr);
    }

    // 2. Interpolate dynamic variables
    const vars = {
      candidate_name: params.candidate_name || "Candidate",
      job_title: params.role_title || "Open Position",
      company_name: params.company_name || "ScalePods",
    };

    const patchBody: Record<string, unknown> = {
      version_number: Number(currentVersion),
    };

    if (params.prompt) {
      patchBody.prompt_text = interpolateDialnexaVariables(params.prompt, vars);
    }

    if (params.first_message) {
      patchBody.welcome_message = interpolateDialnexaVariables(params.first_message, vars);
    }

    if (typeof params.response_eagerness === "number") {
      patchBody.response_eagerness = params.response_eagerness;
    }

    if (typeof params.responsiveness === "number") {
      patchBody.responsiveness = params.responsiveness;
    }

    if (typeof params.interruption_sensitivity === "number") {
      patchBody.interruption_sensitivity = params.interruption_sensitivity;
    }

    if (typeof params.max_duration_seconds === "number" && params.max_duration_seconds > 0) {
      patchBody.max_call_duration_sec = params.max_duration_seconds;
    }

    if (typeof params.end_call_on_silence_sec === "number") {
      patchBody.end_call_on_silence_sec = params.end_call_on_silence_sec;
    }

    if (typeof params.ambient_noise === "boolean") {
      patchBody.ambient_noise = params.ambient_noise;
    }

    // 3. Send PATCH request to DialNexa
    const patchRes = await fetch(`https://api.dialnexa.com/v1/agents/${agentId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patchBody),
    });

    let patchData: { message?: string; error?: string; data?: { id?: string } } = {};
    if (typeof patchRes.json === "function") {
      patchData = (await patchRes.json().catch(() => ({}))) as typeof patchData;
    } else if (typeof patchRes.text === "function") {
      try {
        patchData = JSON.parse(await patchRes.text());
      } catch {
        // ignore
      }
    }

    if (!patchRes.ok) {
      const errMsg =
        patchData.message ||
        patchData.error ||
        `DialNexa PATCH failed with HTTP ${patchRes.status}`;
      console.warn("DialNexa agent sync warning:", errMsg);
      return { success: false, error: errMsg };
    }

    return { success: true, version_number: currentVersion };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn("DialNexa agent sync exception:", errMsg);
    return { success: false, error: errMsg };
  }
}
