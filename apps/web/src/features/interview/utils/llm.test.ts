import { describe, expect, it } from "vitest";
import { extractAnswerEntities, generateProbingFollowUp, isFollowUpGrounded } from "./llm";

describe("interview follow-up generation & grounding", () => {
  it("extracts entities without assuming unmentioned brands", () => {
    const generalCache = extractAnswerEntities(
      "In my recent project we cached user profiles to reduce database load",
    );
    expect(generalCache.primaryTopic).toBe("caching and data retrieval");
    expect(generalCache.matchedKeywords).not.toContain("Redis caching");

    const generalContainer = extractAnswerEntities(
      "We packaged our services into containers for deployment",
    );
    expect(generalContainer.primaryTopic).toBe("containerization and deployment");
    expect(generalContainer.matchedKeywords).not.toContain("Kubernetes orchestration");
  });

  it("extracts specific tools when explicitly stated by candidate", () => {
    const explicitRedis = extractAnswerEntities("We used Redis as our in-memory key-value store");
    expect(explicitRedis.matchedKeywords).toContain("Redis caching");

    const explicitK8s = extractAnswerEntities(
      "We configured autoscaling on our Kubernetes cluster",
    );
    expect(explicitK8s.matchedKeywords).toContain("Kubernetes orchestration");
  });

  it("generates grounded probing follow-ups without hallucinating Redis or Kubernetes", () => {
    const generalProject = generateProbingFollowUp(
      "Could you walk me through your recent project?",
      "In my recent project, I built a web platform for internal analytics. I worked on API endpoints and data queries.",
    );
    expect(generalProject.toLowerCase()).not.toContain("redis");
    expect(generalProject.toLowerCase()).not.toContain("kubernetes");

    const cachingWithoutRedis = generateProbingFollowUp(
      "What did you build?",
      "We implemented a caching mechanism to speed up product catalog searches.",
    );
    expect(cachingWithoutRedis.toLowerCase()).not.toContain("redis");
    expect(cachingWithoutRedis).toContain("caching");

    const containersWithoutK8s = generateProbingFollowUp(
      "How did you deploy?",
      "We containerized each backend service and deployed via Docker.",
    );
    expect(containersWithoutK8s.toLowerCase()).not.toContain("kubernetes");
  });

  it("correctly includes Redis or Kubernetes when the candidate actually mentioned them", () => {
    const redisAnswer = generateProbingFollowUp(
      "Tell me about your architecture",
      "We used Redis clusters for session caching.",
    );
    expect(redisAnswer).toContain("Redis");

    const k8sAnswer = generateProbingFollowUp(
      "How did you manage scale?",
      "We managed our workloads on Kubernetes with HPA.",
    );
    expect(k8sAnswer).toContain("Kubernetes");
  });

  it("detects ungrounded follow-ups that hallucinate unmentioned technologies", () => {
    const answer = "We built a simple REST API with Node and Express.";
    const question = "Tell me about your recent project.";

    // Hallucinating Redis
    expect(
      isFollowUpGrounded(
        "How did you configure Redis cache eviction in that API?",
        answer,
        question,
      ),
    ).toBe(false);

    // Hallucinating Kubernetes
    expect(
      isFollowUpGrounded(
        "How did you set up Kubernetes pod autoscaling for the service?",
        answer,
        question,
      ),
    ).toBe(false);

    // Grounded follow-up
    expect(
      isFollowUpGrounded(
        "How did you handle error handling and input validation in Express?",
        answer,
        question,
      ),
    ).toBe(true);
  });
});
