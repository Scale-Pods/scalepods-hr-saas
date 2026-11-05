/**
 * Normalizes speech-to-text transcripts by mapping common browser/Deepgram STT
 * phonetic misinterpretations and spoken variations to exact technical terms,
 * framework names, automation tools, and infrastructure.
 */
export function normalizeTechnicalSpeech(text: string): string {
  if (!text) return "";

  let normalized = text;

  const replacements: Array<[RegExp, string]> = [
    // Workflow & Automation Tools
    [/\b(n\s*[-]?\s*8\s*[-]?\s*n|n8\s*n|n\s*8n)\b/gi, "n8n"],
    [/\b(zap\s*i\s*er)\b/gi, "Zapier"],
    [/\b(integromat)\b/gi, "Integromat"],

    // AI, LLM & Agent Frameworks
    [/\b(lang\s*chain)\b/gi, "LangChain"],
    [/\b(llama\s*index)\b/gi, "LlamaIndex"],
    [/\b(open\s*ai|open\s*A\s*I)\b/gi, "OpenAI"],
    [/\b(chat\s*g\s*p\s*t|chat\s*gpt)\b/gi, "ChatGPT"],
    [/\b(claude\s*ai)\b/gi, "Claude"],
    [/\b(git\s*hub\s*co\s*pilot)\b/gi, "GitHub Copilot"],
    [/\b(pie\s*torch)\b/gi, "PyTorch"],
    [/\b(tensor\s*flow)\b/gi, "TensorFlow"],
    [/\b(sci\s*kit\s*learn)\b/gi, "scikit-learn"],
    [/\b(hugging\s*face)\b/gi, "Hugging Face"],

    // APIs & Protocols
    [/\b(fast\s*api)\b/gi, "FastAPI"],
    [/\b(graph\s*q\s*l|graph\s*ql)\b/gi, "GraphQL"],
    [/\b(t\s*r\s*p\s*c)\b/gi, "tRPC"],
    [/\b(web\s*socket[s]?|web\s*sock\s*et[s]?)\b/gi, "WebSockets"],
    [/\b(web\s*r\s*t\s*c|web\s*rtc)\b/gi, "WebRTC"],
    [/\b(rest\s*api|rest\s*ful\s*api)\b/gi, "REST API"],
    [/\b(g\s*r\s*p\s*c)\b/gi, "gRPC"],

    // Frontend Frameworks & Libraries
    [/\b(react\s*js)\b/gi, "React"],
    [/\b(next\s*js)\b/gi, "Next.js"],
    [/\b(vue\s*js)\b/gi, "Vue.js"],
    [/\b(nuxt\s*js)\b/gi, "Nuxt.js"],
    [/\b(type\s*script)\b/gi, "TypeScript"],
    [/\b(java\s*script)\b/gi, "JavaScript"],
    [/\b(tail\s*wind\s*css)\b/gi, "Tailwind CSS"],

    // Databases & ORMs
    [/\b(post\s*gress?|post\s*gres\s*q\s*l|post\s*gray\s*sql)\b/gi, "PostgreSQL"],
    [/\b(supa\s*base)\b/gi, "Supabase"],
    [/\b(mongo\s*db)\b/gi, "MongoDB"],
    [/\b(prisma\s*orm)\b/gi, "Prisma"],
    [/\b(elastic\s*search)\b/gi, "Elasticsearch"],

    // Cloud, Infrastructure & DevOps
    [/\b(k\s*8\s*s|k8s|k-8-s)\b/gi, "Kubernetes"],
    [/\b(ver\s*cell|ver\s*sell)\b/gi, "Vercel"],
    [/\b(net\s*li\s*fy)\b/gi, "Netlify"],
    [/\b(micro\s*services|micro\s*service)\b/gi, "microservices"],
    [/\b(A\s*W\s*S)\b/g, "AWS"],
    [/\b(G\s*C\s*P)\b/g, "GCP"],

    // Python & Backend
    [/\b(node\s*js)\b/gi, "Node.js"],
    [/\b(express\s*js)\b/gi, "Express.js"],
  ];

  for (const [pattern, replacement] of replacements) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized;
}
