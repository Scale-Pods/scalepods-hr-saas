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
  questions?: string[];
  evaluation_criteria?: string[];
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
 * DialNexa requires updating the agent via PATCH /v1/agents/{agent_id} with is_published: true
 * so that outbound telephony places calls with the active screening prompt and round questions.
 */
export async function syncDialnexaAgentConfig(
  params: SyncDialnexaAgentParams,
): Promise<{ success: boolean; version_number?: number; error?: string }> {
  const agentId = params.agent_id || DEFAULT_DIALNEXA_AGENT_ID;
  const apiKey = process.env.DIALNEXA_API_KEY || DEFAULT_DIALNEXA_API_KEY;

  try {
    // 1. Fetch current agent version number and published state
    let currentVersion = 13;
    let isCurrentPublished = true;
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
            current_version?: { version_number?: number; is_published?: boolean };
            versions?: Array<{ version_number?: number; is_published?: boolean }>;
          };
        };
        currentVersion =
          getData.data?.current_version_number ||
          getData.data?.current_version?.version_number ||
          13;
        isCurrentPublished = Boolean(
          getData.data?.current_version?.is_published ??
            getData.data?.versions?.find((v) => Number(v.version_number) === Number(currentVersion))
              ?.is_published,
        );
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

    let fullPrompt = params.prompt || "";
    if (params.questions && params.questions.length > 0) {
      const formattedQuestions = params.questions
        .filter((q) => Boolean(q && q.trim()))
        .map((q, idx) => `${idx + 1}. ${q.trim()}`)
        .join("\n");
      if (formattedQuestions) {
        fullPrompt += `\n\nSpecific Interview Questions to ask the candidate:\n${formattedQuestions}`;
      }
    }
    if (params.evaluation_criteria && params.evaluation_criteria.length > 0) {
      const formattedCriteria = params.evaluation_criteria
        .filter((c) => Boolean(c && c.trim()))
        .map((c) => `- ${c.trim()}`)
        .join("\n");
      if (formattedCriteria) {
        fullPrompt += `\n\nEvaluation Criteria to evaluate:\n${formattedCriteria}`;
      }
    }

    // DialNexa prohibits patching an already published version (HTTP 403).
    // If the latest version is already published, increment to the next version number.
    let targetVersion = isCurrentPublished ? Number(currentVersion) + 1 : Number(currentVersion);

    const buildPatchBody = (vNum: number): Record<string, unknown> => {
      const body: Record<string, unknown> = {
        version_number: vNum,
        is_published: true, // Must be published for DialNexa outbound calls to execute this prompt
      };

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

    // 3. Send PATCH request to DialNexa (with retry on published version collision)
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
      (patchRes.status === 403 || String(patchData.message).includes("published"))
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
      return { success: false, error: errMsg };
    }

    return { success: true, version_number: targetVersion };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn("DialNexa agent sync exception:", errMsg);
    return { success: false, error: errMsg };
  }
}
