"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  Clock3,
  Download,
  FileText,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Plus,
  ReceiptText,
  Settings,
  Sparkles,
  Trash2,
  Utensils,
  Wrench,
  X
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { AgentStreamEventSchema, type AgentStreamEvent } from "@mh/shared";
import { applyClientEvent, createEmptyThread, type ClientThread } from "../lib/chatState";
import { Button } from "./ui/button";

const familyPrompt = "今天下午是空的，想和老婆孩子出去玩几个小时，别离家太远，帮我安排一下。";
const friendsPrompt = "今天下午我们 4 个朋友，2 男 2 女，想出去玩几个小时，吃饭也一起安排，别太远。";

function isDraftThread(id: string) {
  return id.startsWith("draft_");
}

function createDraftId() {
  return `draft_${Date.now()}`;
}

function statusText(thread: ClientThread) {
  if (thread.status === "STREAMING") return "规划中";
  if (thread.status === "READY_FOR_CONFIRMATION") return "待确认";
  if (thread.status === "DONE") return "已安排";
  if (thread.status === "PARTIAL_FAILURE") return "部分失败";
  return "待开始";
}

function actionLabel(type: string) {
  const labels: Record<string, string> = {
    reserve_restaurant: "订餐厅",
    book_activity: "订活动",
    schedule_delivery: "配送",
    send_message: "发消息"
  };
  return labels[type] ?? type;
}

function receiptLabel(type: string) {
  const labels: Record<string, string> = {
    activity_booking: "活动预约",
    restaurant_reservation: "餐厅订位",
    delivery_order: "配送订单",
    message_send: "消息发送"
  };
  return labels[type] ?? type;
}

function parseSseFrames(buffer: string) {
  const parts = buffer.split("\n\n");
  return {
    frames: parts.slice(0, -1),
    rest: parts.at(-1) ?? ""
  };
}

function parseFrame(frame: string): AgentStreamEvent | null {
  const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
  if (!dataLine) return null;
  return AgentStreamEventSchema.parse(JSON.parse(dataLine.slice("data: ".length)));
}

export function ChatWorkspace() {
  const initialDraftId = useMemo(createDraftId, []);
  const [activeThreadId, setActiveThreadId] = useState(initialDraftId);
  const [threads, setThreads] = useState<Record<string, ClientThread>>({
    [initialDraftId]: createEmptyThread(initialDraftId)
  });
  const [input, setInput] = useState(familyPrompt);
  const [isStreaming, setStreaming] = useState(false);
  const currentRequestRef = useRef<AbortController | null>(null);

  const activeThread = threads[activeThreadId] ?? createEmptyThread(activeThreadId);
  const recentThreads = Object.values(threads).filter((thread) => !isDraftThread(thread.id) || thread.messages.length > 0);
  const canSend = input.trim().length > 0 && !isStreaming;

  function startNewChat() {
    const id = createDraftId();
    setActiveThreadId(id);
    setThreads((prev) => ({ ...prev, [id]: createEmptyThread(id) }));
    setInput(familyPrompt);
  }

  function removeThread(id: string) {
    setThreads((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (activeThreadId === id) {
      startNewChat();
    }
  }

  function upsertThread(currentKey: string, event: AgentStreamEvent) {
    setThreads((prev) => {
      const current = prev[currentKey] ?? createEmptyThread(currentKey);
      const updated = applyClientEvent(current, event);
      if (event.threadId !== currentKey) {
        const next = { ...prev };
        delete next[currentKey];
        next[event.threadId] = updated;
        return next;
      }
      return { ...prev, [currentKey]: updated };
    });

    if (event.type === "thread.created") {
      setActiveThreadId(event.threadId);
    }
  }

  async function sendMessage(text = input) {
    const message = text.trim();
    if (!message || isStreaming) return;

    const requestThreadId = isDraftThread(activeThreadId) ? undefined : activeThreadId;
    let currentKey = activeThreadId;
    const now = new Date().toISOString();
    setStreaming(true);
    setInput("");

    setThreads((prev) => {
      const current = prev[currentKey] ?? createEmptyThread(currentKey);
      return {
        ...prev,
        [currentKey]: {
          ...current,
          status: "STREAMING",
          messages: [
            ...current.messages,
            {
              id: `local_${Date.now()}`,
              role: "user",
              content: message,
              createdAt: now,
              completed: true
            }
          ]
        }
      };
    });

    const controller = new AbortController();
    currentRequestRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: requestThreadId,
          message,
          clientRunId: `run_${Date.now()}`
        }),
        signal: controller.signal
      });

      if (!response.ok || !response.body) {
        throw new Error(`Chat request failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseFrames(buffer);
        buffer = parsed.rest;

        for (const frame of parsed.frames) {
          const event = parseFrame(frame);
          if (!event) continue;
          upsertThread(currentKey, event);
          if (event.type === "thread.created") {
            currentKey = event.threadId;
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast.error(error instanceof Error ? error.message : "对话请求失败");
      }
    } finally {
      setStreaming(false);
      currentRequestRef.current = null;
    }
  }

  function stopStreaming() {
    currentRequestRef.current?.abort();
    setStreaming(false);
  }

  return (
    <>
      <Toaster position="top-center" />
      <div className="workspace-shell">
        <aside className="workspace-sidebar">
          <div className="sidebar-brand">
            <div>
              <strong>LocalActivity</strong>
              <span>Meituan Agent</span>
            </div>
            <Button variant="ghost" size="icon" aria-label="更多">
              <MoreHorizontal size={17} />
            </Button>
          </div>

          <div className="sidebar-section">
            <Button className="sidebar-action" variant="ghost" onClick={startNewChat}>
              <Plus size={16} />
              新对话
            </Button>
            <button className="sidebar-nav active" type="button">
              <MessageSquare size={16} />
              对话
            </button>
            <button className="sidebar-nav" type="button">
              <Bot size={16} />
              智能体
            </button>
          </div>

          <div className="sidebar-section sidebar-history">
            <p className="sidebar-label">最近对话</p>
            {recentThreads.map((thread) => (
              <div className="history-row" key={thread.id}>
                <button
                  className={thread.id === activeThreadId ? "history-item selected" : "history-item"}
                  type="button"
                  onClick={() => setActiveThreadId(thread.id)}
                >
                  <span>{thread.title}</span>
                  <small>{statusText(thread)}</small>
                </button>
                <Button variant="ghost" size="icon" aria-label="删除对话" onClick={() => removeThread(thread.id)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>

          <div className="sidebar-footer">
            <button className="sidebar-nav" type="button">
              <Settings size={16} />
              设置和更多
            </button>
          </div>
        </aside>

      <main className="chat-main">
        <header className="chat-header">
          <div>
            <h1>{activeThread.title}</h1>
            <span>{statusText(activeThread)}</span>
          </div>
          <div className="header-actions">
            <Button variant="ghost" size="sm">
              <Download size={15} />
              导出
            </Button>
            <Button variant="ghost" size="sm">
              <FileText size={15} />
              文件
            </Button>
          </div>
        </header>

        <section className="conversation">
          {activeThread.messages.length === 0 ? (
            <div className="welcome-state">
              <Sparkles size={24} />
              <h2>今天下午想怎么安排？</h2>
              <div className="suggestions">
                <button type="button" onClick={() => void sendMessage(familyPrompt)}>
                  家庭亲子半日
                </button>
                <button type="button" onClick={() => void sendMessage(friendsPrompt)}>
                  四人朋友局
                </button>
              </div>
            </div>
          ) : (
            <div className="message-stack">
              {activeThread.messages.map((message) => (
                <article className={`message ${message.role}`} key={message.id}>
                  <div className="message-content">{message.content}</div>
                </article>
              ))}

              {(activeThread.steps.length > 0 || activeThread.plan || activeThread.receipts.length > 0) && (
                <article className="message assistant">
                  <div className="assistant-artifacts">
                    {activeThread.steps.length > 0 && (
                      <details className="steps-card" open={activeThread.status === "STREAMING"}>
                        <summary>
                          <span>
                            <ChevronDown size={16} />
                            执行步骤
                          </span>
                          <small>{activeThread.steps.length}</small>
                        </summary>
                        <div className="step-list">
                          {activeThread.steps.map((step) => (
                            <div className={`step-row ${step.status}`} key={step.id}>
                              {step.kind === "tool" ? <Wrench size={15} /> : <Clock3 size={15} />}
                              <div>
                                <strong>{step.title}</strong>
                                <p>{step.error?.message ?? step.detail ?? step.outputSummary ?? step.inputSummary}</p>
                              </div>
                              <em>{step.status}</em>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}

                    {activeThread.plan && (
                      <div className="plan-card">
                        <div className="plan-card-header">
                          <div>
                            <span className="artifact-kicker">方案</span>
                            <h3>{activeThread.plan.title}</h3>
                          </div>
                          <strong>{Math.round(activeThread.plan.totalDurationMinutes / 60)}h</strong>
                        </div>
                        <p>{activeThread.plan.summary}</p>
                        <ol className="timeline-list">
                          {activeThread.plan.timeline.map((step) => (
                            <li key={step.id}>
                              <time>
                                {step.startTime}-{step.endTime}
                              </time>
                              <div>
                                <strong>{step.title}</strong>
                                <span>{step.placeName ?? step.address ?? step.type}</span>
                              </div>
                            </li>
                          ))}
                        </ol>
                        {activeThread.plan.risks.length > 0 && (
                          <div className="risk-list">
                            {activeThread.plan.risks.map((risk) => (
                              <span key={risk.code}>{risk.message}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {activeThread.confirmation && activeThread.status === "READY_FOR_CONFIRMATION" && (
                      <div className="confirmation-card">
                        <div>
                          <span className="artifact-kicker">待确认</span>
                          <p>{activeThread.confirmation.summary}</p>
                        </div>
                        <div className="action-list">
                          {activeThread.confirmation.actions.map((action) => (
                            <span key={action.id}>{actionLabel(action.type)}</span>
                          ))}
                        </div>
                        <div className="confirmation-actions">
                          <Button onClick={() => void sendMessage("确认，就按这个安排")}>
                            <Check size={16} />
                            确认并安排
                          </Button>
                          <Button variant="outline" onClick={() => setInput("我想调整一下：")}>
                            调整方案
                          </Button>
                        </div>
                      </div>
                    )}

                    {activeThread.receipts.length > 0 && (
                      <div className="receipt-grid">
                        {activeThread.receipts.map((receipt) => (
                          <div className="receipt-card" key={receipt.id}>
                            <ReceiptText size={16} />
                            <div>
                              <strong>{receipt.targetName}</strong>
                              <span>
                                {receiptLabel(receipt.type)}
                                {receipt.time ? ` · ${receipt.time}` : ""}
                              </span>
                            </div>
                            <em>{receipt.status}</em>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              )}
            </div>
          )}
        </section>

        <form
          className="composer-wrap"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage();
          }}
        >
          <div className="composer">
            <textarea
              value={input}
              placeholder="今天我能为你做些什么？"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
            />
            <div className="composer-footer">
              <div className="composer-tools">
                <button type="button" onClick={() => setInput(familyPrompt)}>
                  亲子
                </button>
                <button type="button" onClick={() => setInput(friendsPrompt)}>
                  朋友
                </button>
                <span>
                  <Utensils size={13} />
                  Pro
                </span>
              </div>
              {isStreaming ? (
                <Button type="button" size="icon" variant="outline" aria-label="停止" onClick={stopStreaming}>
                  <X size={16} />
                </Button>
              ) : (
                <Button type="submit" size="icon" aria-label="发送" disabled={!canSend}>
                  {isStreaming ? <Loader2 className="spin" size={16} /> : <ArrowUp size={16} />}
                </Button>
              )}
            </div>
          </div>
        </form>
      </main>
      </div>
    </>
  );
}
