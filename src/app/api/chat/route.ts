import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ClientMessage = {
  role: "user" | "assistant";
  content: string;
};

type Correction = {
  issue: string;
  explanation: string;
  suggested_rewrite: string;
};

type StructuredResponse = {
  assistant_reply: string;
  corrections: Correction[];
  follow_up_questions: string[];
};

const SYSTEM_PROMPT = [
  "You are a friendly English conversation partner.",
  "Always reply in natural English and keep the conversation going.",
  "Analyze only the user's latest message for grammar mistakes, word choice issues, or better expressions.",
  "If there are improvements, return them as corrections. If none, return an empty corrections array.",
  "Write issue and explanation in Chinese, and suggested_rewrite in English.",
  "Do not correct the assistant's messages.",
  "Also return follow_up_questions: 2-3 short English questions to help the user continue.",
  "Do not include follow-up questions inside assistant_reply.",
  "Return only JSON that matches the schema.",
].join("\n");

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

const openai = new OpenAI({
  baseURL: process.env.OPENAI_BASE_URL,
  apiKey: process.env.OPENAI_API_KEY,
});

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    assistant_reply: { type: "string" },
    follow_up_questions: {
      type: "array",
      items: { type: "string" },
    },
    corrections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          issue: { type: "string" },
          explanation: { type: "string" },
          suggested_rewrite: { type: "string" },
        },
        required: ["issue", "explanation", "suggested_rewrite"],
      },
    },
  },
  required: ["assistant_reply", "follow_up_questions", "corrections"],
} as const;

const normalizeStructuredResponse = (parsed: unknown): StructuredResponse | null => {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.assistant_reply !== "string") {
    return null;
  }
  const corrections = Array.isArray(record.corrections)
    ? (record.corrections as Correction[]).filter(
        (item) =>
          item &&
          typeof item.issue === "string" &&
          typeof item.explanation === "string" &&
          typeof item.suggested_rewrite === "string"
      )
    : [];
  const followUpQuestions = Array.isArray(record.follow_up_questions)
    ? (record.follow_up_questions as unknown[]).filter(
        (item) => typeof item === "string"
      )
    : [];
  return {
    assistant_reply: record.assistant_reply,
    corrections,
    follow_up_questions: followUpQuestions,
  };
};

const parseStructuredOutput = (
  raw?: string | null
): StructuredResponse | null => {
  if (!raw) {
    return null;
  }
  let cleaned = raw.trim();
  if (!cleaned) {
    return null;
  }
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    return normalizeStructuredResponse(parsed);
  } catch {
    // Fall through to substring extraction.
  }

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      return normalizeStructuredResponse(parsed);
    } catch {
      return null;
    }
  }
  return null;
};

const generateWithResponses = async (
  messages: ClientMessage[]
): Promise<StructuredResponse | null> => {
  try {
    const response = await openai.responses.create({
      model: MODEL,
      input: [{ role: "developer", content: SYSTEM_PROMPT }, ...messages],
      text: {
        format: {
          type: "json_schema",
          name: "english_chat_feedback",
          strict: true,
          schema: RESPONSE_SCHEMA,
        },
      },
    });

    return parseStructuredOutput(response.output_text);
  } catch {
    return null;
  }
};

const generateWithChat = async (
  messages: ClientMessage[]
): Promise<StructuredResponse | null> => {
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "english_chat_feedback",
          strict: true,
          schema: RESPONSE_SCHEMA,
        },
      },
    });

    const content = completion.choices[0]?.message?.content;
    const parsed = parseStructuredOutput(content);
    if (parsed) {
      return parsed;
    }
  } catch {
    // ignore and try relaxed JSON prompt below
  }

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `${SYSTEM_PROMPT}\nReturn ONLY valid JSON, no extra text, no code fences.`,
        },
        ...messages,
      ],
      temperature: 0,
    });

    const content = completion.choices[0]?.message?.content;
    return parseStructuredOutput(content);
  } catch {
    return null;
  }
};

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY." },
      { status: 500 }
    );
  }

  const body = await request.json();
  const rawMessages = Array.isArray(body?.messages) ? body.messages : [];

  const messages = rawMessages
    .filter((message: ClientMessage) => message && typeof message === "object")
    .map((message: ClientMessage) => ({
      role: message.role,
      content: message.content,
    }))
    .filter(
      (message: ClientMessage) =>
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0
    )
    .slice(-12);

  if (messages.length === 0) {
    return NextResponse.json(
      { error: "No valid messages provided." },
      { status: 400 }
    );
  }

  const structured =
    (await generateWithResponses(messages)) ?? (await generateWithChat(messages));

  if (!structured) {
    return NextResponse.json(
      {
        error:
          "Model did not return valid JSON. Please use a model that supports structured outputs (e.g. gpt-4o-mini) and avoid non-OpenAI base URLs.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json(structured);
}
