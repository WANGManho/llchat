"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Correction = {
  issue: string;
  explanation: string;
  suggested_rewrite: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  corrections?: Correction[];
  followUpQuestions?: string[];
};

const starterPrompts = [
  {
    label: "Travel plans",
    value: "I'm planning a trip soon. Can we talk about travel?",
  },
  {
    label: "Work life",
    value: "I'd like to practice describing my work day in English.",
  },
  {
    label: "Hobbies",
    value: "I want to talk about my hobbies and learn better expressions.",
  },
];

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (isLoading) return;
    const trimmed = input.trim();
    if (!trimmed) return;

    setError(null);
    setInput("");

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const payloadMessages = [...messages, userMessage].map((message) => ({
        role: message.role,
        content: message.content,
      }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payloadMessages }),
      });

      if (!response.ok) {
        let detail = "Request failed.";
        try {
          const data = (await response.json()) as { error?: string };
          if (data?.error) {
            detail = data.error;
          } else {
            detail = JSON.stringify(data);
          }
        } catch {
          detail = await response.text();
        }
        throw new Error(detail || "Request failed.");
      }

      const data = (await response.json()) as {
        assistant_reply: string;
        corrections: Correction[];
        follow_up_questions?: string[];
      };

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.assistant_reply,
        followUpQuestions: data.follow_up_questions ?? [],
      };

      setMessages((prev) => {
        const updated = prev.map((message) =>
          message.id === userMessage.id
            ? { ...message, corrections: data.corrections }
            : message
        );
        return [...updated, assistantMessage];
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 right-[-10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_top,_#f6d08a,_transparent_70%)] opacity-70 blur-3xl animate-[floatSlow_14s_ease-in-out_infinite]" />
        <div className="absolute bottom-[-20%] left-[-10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_top,_#8bd0cf,_transparent_70%)] opacity-60 blur-3xl animate-[floatSlow_18s_ease-in-out_infinite]" />
      </div>

      <main className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-3">
          <span className="text-xs uppercase tracking-[0.4em] text-[color:var(--muted)]">
            English Practice Lab
          </span>
          <h1 className="font-[var(--font-fraunces)] text-4xl text-[color:var(--foreground)] sm:text-5xl">
            Chat in English. Get instant, gentle feedback.
          </h1>
          <p className="max-w-2xl text-base text-[color:var(--muted)] sm:text-lg">
            和 AI 用英文对话，系统会在你的回复下给出语法、用词和更好表达的建议。
          </p>
        </header>

        <section className="flex min-h-[70vh] flex-col rounded-3xl border border-black/5 bg-[color:var(--paper)] shadow-[0_30px_80px_-50px_rgba(0,0,0,0.35)] backdrop-blur">
          <div className="flex items-center justify-between border-b border-black/5 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[color:var(--accent)] text-sm font-semibold text-white">
                AI
              </div>
              <div>
                <p className="text-sm font-semibold text-[color:var(--foreground)]">
                  English Coach
                </p>
                <p className="text-xs text-[color:var(--muted)]">
                  Always reply in English, with friendly corrections.
                </p>
              </div>
            </div>
            <span className="rounded-full bg-black/5 px-3 py-1 text-xs text-[color:var(--muted)]">
              实时建议
            </span>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-start justify-center gap-6 text-[color:var(--muted)]">
                <div className="rounded-3xl border border-dashed border-black/10 bg-white/60 px-6 py-5">
                  <p className="text-sm font-semibold text-[color:var(--foreground)]">
                    Start with a topic
                  </p>
                  <p className="mt-1 text-sm">
                    选择一个话题，或直接用英文开始聊天。
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {starterPrompts.map((prompt) => (
                    <button
                      key={prompt.label}
                      type="button"
                      onClick={() => setInput(prompt.value)}
                      className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-[color:var(--foreground)] transition hover:-translate-y-0.5 hover:border-[color:var(--accent)] hover:text-[color:var(--accent-strong)]"
                    >
                      {prompt.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className="animate-[fadeSlide_0.35s_ease-out]"
                >
                  <div
                    className={`flex flex-col gap-2 ${
                      message.role === "user"
                        ? "items-end"
                        : "items-start"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-3xl px-5 py-4 text-sm shadow-sm sm:text-base ${
                        message.role === "user"
                          ? "bg-[color:var(--accent)] text-white"
                          : "bg-white text-[color:var(--foreground)]"
                      }`}
                    >
                      <p className="whitespace-pre-wrap leading-relaxed">
                        {message.content}
                      </p>
                    </div>

                    {message.role === "user" &&
                    message.corrections &&
                    message.corrections.length > 0 ? (
                      <div className="w-full max-w-[80%] rounded-3xl border border-black/10 bg-[rgba(246,208,138,0.15)] px-5 py-4 text-sm text-[color:var(--foreground)]">
                        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[color:var(--muted)]">
                          改进建议
                        </p>
                        <div className="mt-3 space-y-3">
                          {message.corrections.map((correction, index) => (
                            <div
                              key={`${message.id}-correction-${index}`}
                              className="rounded-2xl bg-white/80 px-4 py-3 shadow-sm"
                            >
                              <p className="text-xs font-semibold text-[color:var(--muted)]">
                                建议 {index + 1}
                              </p>
                              <p className="mt-1 text-sm font-semibold">
                                {correction.issue}
                              </p>
                              <p className="mt-1 text-sm text-[color:var(--muted)]">
                                {correction.explanation}
                              </p>
                              <div className="mt-2 rounded-xl bg-[rgba(141,208,207,0.25)] px-3 py-2 text-sm font-medium text-[color:var(--accent-strong)]">
                                {correction.suggested_rewrite}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {message.role === "assistant" &&
                    message.followUpQuestions &&
                    message.followUpQuestions.length > 0 ? (
                      <div className="flex w-full max-w-[80%] flex-wrap gap-2">
                        {message.followUpQuestions.map((question, index) => (
                          <button
                            key={`${message.id}-follow-${index}`}
                            type="button"
                            onClick={() => {
                              setInput(question);
                              inputRef.current?.focus();
                            }}
                            className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-[color:var(--foreground)] transition hover:-translate-y-0.5 hover:border-[color:var(--accent)] hover:text-[color:var(--accent-strong)]"
                          >
                            {question}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}

            {isLoading ? (
              <div className="flex items-center gap-3 text-sm text-[color:var(--muted)]">
                <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-black/5 text-xs">
                  …
                </div>
                <span>Coach is thinking…</span>
              </div>
            ) : null}

            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="border-t border-black/5 px-6 py-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="text-xs font-semibold uppercase tracking-[0.25em] text-[color:var(--muted)]">
                  Your message
                </label>
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Type in English... 用英文输入，Shift+Enter 换行"
                  rows={3}
                  aria-label="Your message in English"
                  ref={inputRef}
                  className="mt-2 w-full resize-none rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[color:var(--foreground)] shadow-sm outline-none transition focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[rgba(29,107,112,0.15)]"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex h-12 items-center justify-center rounded-full bg-[color:var(--accent)] px-6 text-sm font-semibold text-white transition hover:bg-[color:var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                发送
              </button>
            </div>
            {error ? (
              <p className="mt-3 text-xs text-red-600" role="alert">
                {error}
              </p>
            ) : null}
          </form>
        </section>
      </main>
    </div>
  );
}
