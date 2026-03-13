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

    const outputText = response.output_text?.trim();
    if (!outputText) {
      return NextResponse.json(
        { error: "Empty response from model." },
        { status: 502 }
      );
    }

    const parsed = JSON.parse(outputText) as {
      assistant_reply: string;
      corrections: Correction[];
    };

    return NextResponse.json(parsed);
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? (error as { status?: number }).status
        : undefined;
    const message =
      error instanceof Error ? error.message : "Failed to generate response.";

    if (status === 404 || message.includes("404")) {
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

        const content = completion.choices[0]?.message?.content?.trim();
        if (!content) {
          return NextResponse.json(
            { error: "Empty response from model." },
            { status: 502 }
          );
        }

        const parsed = JSON.parse(content) as {
          assistant_reply: string;
          corrections: Correction[];
        };

        return NextResponse.json(parsed);
      } catch (fallbackError) {
        const fallbackMessage =
          fallbackError instanceof Error
            ? fallbackError.message
            : "Failed to generate response.";
        return NextResponse.json({ error: fallbackMessage }, { status: 500 });
      }
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
