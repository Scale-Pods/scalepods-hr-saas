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
    // "air n8n", "n ate n", "en ate en" are common STT hallucinations for n8n
    [
      /\b(air\s*n\s*[-]?\s*8\s*[-]?\s*n|n\s*ate\s*n|en\s*ate\s*en|n\s*[-]?\s*8\s*[-]?\s*n|n8\s*n|n\s*8n|in\s+anytime\s+workshoot|in\s+it\s+and\s+workers|anytime\s+workshoot)\b/gi,
      "n8n",
    ],
    [/\b(zap\s*i\s*er)\b/gi, "Zapier"],
    [/\b(integromat)\b/gi, "Integromat"],
    [/\b(air\s*flow|apache\s*air\s*flow)\b/gi, "Airflow"],
    [/\b(post\s*man)\b/gi, "Postman"],

    // AI, LLM & Agent Frameworks & Hardware
    [/\b(groq|groc|grok|brock\s+brock|brock|crock|rock)\b/gi, "Groq"],
    [/\b(gemini|geminize|gemini\s*api)\b/gi, "Gemini"],
    [/\b(claude|the\s+lord\s+claud|the\s+lord|claud)\b/gi, "Claude"],
    [/\b(llama\s*3\.?\d*|llama|lama)\b/gi, "Llama"],
    [/\b(lang\s*chain)\b/gi, "LangChain"],
    [/\b(llama\s*index)\b/gi, "LlamaIndex"],
    [/\b(open\s*ai|open\s*A\s*I)\b/gi, "OpenAI"],
    [/\b(chat\s*g\s*p\s*t|chat\s*gpt)\b/gi, "ChatGPT"],
    [/\b(git\s*hub\s*co\s*pilot)\b/gi, "GitHub Copilot"],
    [/\b(pie\s*torch)\b/gi, "PyTorch"],
    [/\b(tensor\s*flow)\b/gi, "TensorFlow"],
    [/\b(sci\s*kit\s*learn)\b/gi, "scikit-learn"],
    [/\b(hugging\s*face)\b/gi, "Hugging Face"],

    // Candidate Projects & Companies
    [/\b(skill\s*gap\s*ai|skill\s*gap|screen\s*of\s*air|scale\s*gap)\b/gi, "SkillGap AI"],
    [/\b(scale\s*pods|scalepods)\b/gi, "ScalePods"],
    [/\b(deccan\s*ai)\b/gi, "Deccan AI"],
    [/\b(li\s*dar|lidar|leader\s+point\s+cloud)\b/gi, "LiDAR"],

    // APIs & Protocols
    [/\b(meta\s*graph\s*api|meta\s*graph)\b/gi, "Meta Graph API"],
    [/\b(whats\s*app\s*business\s*api|whats\s*app\s*api|whats\s*app)\b/gi, "WhatsApp Business API"],

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
    [/\b(elastic\s*search|open\s*search)\b/gi, "Elasticsearch"],
    [/\b(dynamo\s*db|dynamo\s*d\.?\s*b\.?)\b/gi, "DynamoDB"],

    // Messaging & Queues
    [/\b(rabbit\s*m\s*q|rabbit\s*mq)\b/gi, "RabbitMQ"],
    [/\b(apache\s*kafka)\b/gi, "Kafka"],

    // Cloud, Infrastructure & DevOps
    [/\b(k\s*8\s*s|k8s|k-8-s)\b/gi, "Kubernetes"],
    [/\b(docker\s*compose)\b/gi, "Docker Compose"],
    [/\b(bit\s*bucket)\b/gi, "Bitbucket"],
    [/\b(github\s*actions?)\b/gi, "GitHub Actions"],
    [/\b(ver\s*cell|ver\s*sell)\b/gi, "Vercel"],
    [/\b(net\s*li\s*fy)\b/gi, "Netlify"],
    [/\b(fire\s*base)\b/gi, "Firebase"],
    [/\b(big\s*query)\b/gi, "BigQuery"],
    [/\b(micro\s*services|micro\s*service)\b/gi, "microservices"],
    [/\b(A\s*W\s*S)\b/g, "AWS"],
    [/\b(G\s*C\s*P)\b/g, "GCP"],

    // Python & Backend
    [/\b(node\s*js)\b/gi, "Node.js"],
    [/\b(express\s*js)\b/gi, "Express.js"],
    [/\b(java\s*spring|spring\s*boot)\b/gi, "Spring Boot"],
  ];

  for (const [pattern, replacement] of replacements) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized;
}
