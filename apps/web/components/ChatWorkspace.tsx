"use client";

import { type AgentStreamEvent, AgentStreamEventSchema } from "@mh/core/shared";
import {
  AlertTriangle,
  ArrowUp,
  Bot,
  CalendarCheck,
  Check,
  ChevronDown,
  Clock3,
  Download,
  FileText,
  ListChecks,
  Loader2,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  ReceiptText,
  Route,
  Settings,
  Sparkles,
  Trash2,
  Utensils,
  Wrench,
  X
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { Streamdown } from "streamdown";
import { applyClientEvent, type ClientThread, createEmptyThread } from "../lib/chatState";
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

type ArtifactTab = "document" | "plan" | "confirmation" | "receipts" | "diagnostics";
type WorkspaceView = "chat" | "plan";
type ArtifactJumpTarget = "top" | "timeline";

function artifactLabel(tab: ArtifactTab) {
  const labels: Record<ArtifactTab, string> = {
    document: "文档",
    plan: "方案",
    confirmation: "确认",
    receipts: "回执",
    diagnostics: "诊断"
  };
  return labels[tab];
}

function artifactIcon(tab: ArtifactTab) {
  const iconProps = { size: 14, strokeWidth: 2.1 };
  const icons: Record<ArtifactTab, ReactNode> = {
    document: <FileText {...iconProps} />,
    plan: <Route {...iconProps} />,
    confirmation: <CalendarCheck {...iconProps} />,
    receipts: <ReceiptText {...iconProps} />,
    diagnostics: <AlertTriangle {...iconProps} />
  };
  return icons[tab];
}

function toolStatusText(status: string) {
  const labels: Record<string, string> = {
    running: "进行中",
    succeeded: "完成",
    failed: "需调整",
    skipped: "已跳过"
  };
  return labels[status] ?? status;
}

function receiptStatusText(status: string) {
  const labels: Record<string, string> = {
    confirmed: "已确认",
    sent: "已发送",
    scheduled: "已安排",
    failed: "失败"
  };
  return labels[status] ?? status;
}

function availableArtifactTabs(thread: ClientThread): ArtifactTab[] {
  return [
    thread.artifacts.length > 0 ? "document" : undefined,
    thread.plan && thread.artifacts.length === 0 ? "plan" : undefined,
    thread.confirmation ? "confirmation" : undefined,
    thread.receipts.length > 0 ? "receipts" : undefined,
    thread.failure || thread.steps.some((step) => step.status === "failed" || step.status === "skipped")
      ? "diagnostics"
      : undefined
  ].filter(Boolean) as ArtifactTab[];
}

function selectedArtifact(thread: ClientThread): ArtifactTab | undefined {
  const tabs = availableArtifactTabs(thread);
  return tabs.includes(thread.artifactPanel.selected as ArtifactTab)
    ? (thread.artifactPanel.selected as ArtifactTab)
    : tabs[0];
}

function activeMarkdownArtifact(thread: ClientThread) {
  return thread.artifacts.find((artifact) => artifact.id === thread.activeArtifactId) ?? thread.artifacts.at(-1);
}

function stepDetail(step: ClientThread["steps"][number]) {
  return step.error?.message ?? step.detail ?? step.outputSummary ?? step.inputSummary ?? "";
}

function displayItems(step: ClientThread["steps"][number]) {
  return step.display?.items ?? [];
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

function RunActivityPanel({
  thread,
  openArtifact
}: {
  thread: ClientThread;
  openArtifact: (tab: ArtifactTab, target?: ArtifactJumpTarget) => void;
}) {
  const hiddenCount = Math.max(0, thread.steps.length - 6);
  const visibleSteps = thread.steps.slice(-6);
  const runningStep = [...thread.steps].reverse().find((step) => step.status === "running");
  const failedCount = thread.steps.filter((step) => step.status === "failed").length;
  const skippedCount = thread.steps.filter((step) => step.status === "skipped").length;

  return (
    <div className="assistant-artifacts">
      {thread.steps.length > 0 && (
        <details className="steps-card" open={thread.status === "STREAMING"}>
          <summary>
            <span>
              <ChevronDown size={16} />
              执行步骤
              {runningStep ? <b>{runningStep.title}</b> : null}
            </span>
            <small>
              {thread.steps.length}
              {failedCount > 0 ? ` · ${failedCount} 个需调整` : ""}
              {skippedCount > 0 ? ` · ${skippedCount} 个跳过` : ""}
            </small>
          </summary>
          <div className="step-list">
            {hiddenCount > 0 && <div className="step-hidden">已收起较早的 {hiddenCount} 个步骤</div>}
            {visibleSteps.map((step) => (
              <div className={`step-row ${step.status}`} key={step.id}>
                {step.kind === "tool" ? <Wrench size={15} /> : <Clock3 size={15} />}
                <div>
                  <strong>{step.title}</strong>
                  {stepDetail(step) ? <p>{stepDetail(step)}</p> : null}
                  {displayItems(step).length > 0 && (
                    <div className="step-pills">
                      {displayItems(step)
                        .slice(0, 3)
                        .map((item) => (
                          <span key={`${step.id}:${item.label}:${item.value}`}>{`${item.label}: ${item.value}`}</span>
                        ))}
                    </div>
                  )}
                </div>
                <em>{toolStatusText(step.status)}</em>
              </div>
            ))}
          </div>
        </details>
      )}

      {(thread.plan || thread.confirmation || thread.receipts.length > 0 || thread.failure) && (
        <div className="artifact-inline">
          <div>
            <strong>
              {thread.failure
                ? "本轮需要处理"
                : thread.receipts.length > 0
                  ? "执行结果已写入文档"
                  : thread.artifacts.length > 0
                    ? "方案文档已生成"
                    : "方案产物已生成"}
            </strong>
            <span>
              {thread.failure?.summary ??
                activeMarkdownArtifact(thread)?.title ??
                (thread.confirmation ? "等待你确认后执行预约和通知。" : undefined) ??
                thread.plan?.summary ??
                `${thread.receipts.length} 个执行回执`}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() =>
              openArtifact(thread.artifacts.length > 0 ? "document" : (selectedArtifact(thread) ?? "plan"), "timeline")
            }
          >
            <PanelRightOpen size={15} />
            查看产物
          </Button>
        </div>
      )}
    </div>
  );
}

function PlanWorkspace({
  thread,
  selected,
  composer,
  onSelect,
  onBack,
  onConfirm,
  onRevise
}: {
  thread: ClientThread;
  selected?: ArtifactTab;
  composer: ReactNode;
  onSelect: (tab: ArtifactTab) => void;
  onBack: () => void;
  onConfirm: () => void;
  onRevise: () => void;
}) {
  const tabs = availableArtifactTabs(thread);
  const active = selected ?? tabs[0];
  const title = thread.plan?.title ?? activeMarkdownArtifact(thread)?.title ?? "方案详情";

  if (!active) {
    return (
      <section className="plan-workspace empty" aria-label="方案详情">
        <div className="plan-empty-state">
          <Route size={24} />
          <h2>方案会出现在这里</h2>
          <p>先在对话里告诉我你想怎么安排，生成方案后这里会展示完整行程、确认项和执行回执。</p>
          <Button type="button" variant="outline" onClick={onBack}>
            <MessageSquare size={15} />
            回到对话
          </Button>
        </div>
        <div className="plan-workspace-composer">{composer}</div>
      </section>
    );
  }

  return (
    <section className="plan-workspace" aria-label="方案详情">
      <div className="plan-workspace-shell">
        <header className="plan-workspace-header">
          <div>
            <span className="artifact-kicker">方案中心</span>
            <h2>{title}</h2>
            <p>查看完整方案、时间线、确认项和执行后的回执。</p>
          </div>
          <Button type="button" variant="outline" onClick={onBack}>
            <MessageSquare size={15} />
            回到对话
          </Button>
        </header>
        <ArtifactPanel
          thread={thread}
          selected={active}
          onSelect={onSelect}
          onClose={onBack}
          onConfirm={onConfirm}
          onRevise={onRevise}
        />
        <div className="plan-workspace-composer">{composer}</div>
      </div>
    </section>
  );
}

function ArtifactPanel({
  thread,
  selected,
  onSelect,
  onClose,
  onConfirm,
  onRevise
}: {
  thread: ClientThread;
  selected?: ArtifactTab;
  onSelect: (tab: ArtifactTab) => void;
  onClose: () => void;
  onConfirm: () => void;
  onRevise: () => void;
}) {
  const tabs = availableArtifactTabs(thread);
  const active = selected ?? tabs[0];
  const markdownArtifact = activeMarkdownArtifact(thread);
  const documentState = markdownArtifact?.status === "final" ? "已完成" : thread.confirmation ? "待确认" : "草稿";
  const documentStateClass = markdownArtifact?.status === "final" ? "final" : thread.confirmation ? "pending" : "draft";

  if (!active) {
    return null;
  }

  return (
    <aside className="artifact-panel" aria-label="产物面板">
      <header className="artifact-panel-header">
        <div>
          <span className="artifact-kicker">产物</span>
          <h2>{artifactLabel(active)}</h2>
        </div>
        <Button variant="ghost" size="icon" type="button" aria-label="关闭产物面板" onClick={onClose}>
          <PanelRightClose size={17} />
        </Button>
      </header>

      <div className="artifact-tabs" role="tablist" aria-label="产物类型">
        {tabs.map((tab) => (
          <button
            className={tab === active ? "selected" : ""}
            key={tab}
            type="button"
            role="tab"
            aria-selected={tab === active}
            onClick={() => onSelect(tab)}
          >
            {artifactIcon(tab)}
            {artifactLabel(tab)}
          </button>
        ))}
      </div>

      <div className="artifact-panel-body">
        {active === "document" && markdownArtifact && (
          <section className="artifact-section document-section">
            <div className="document-hero">
              <div className="document-title-row">
                <span className="document-icon">
                  <FileText size={18} />
                </span>
                <div>
                  <span className="artifact-kicker">
                    {markdownArtifact.status === "final" ? "最终文档" : "方案文档"}
                  </span>
                  <h3>{markdownArtifact.title}</h3>
                </div>
              </div>
              <strong className={`document-status ${documentStateClass}`}>{documentState}</strong>
            </div>
            {thread.plan && (
              <div className="document-snapshot">
                <span>
                  <Clock3 size={15} />
                  {Math.round(thread.plan.totalDurationMinutes / 60)} 小时
                </span>
                <span>
                  <Utensils size={15} />
                  {thread.plan.estimatedBudgetCny} 元
                </span>
                <span>
                  <Sparkles size={15} />
                  {Math.round(thread.plan.confidence * 100)}%
                </span>
              </div>
            )}
            {thread.confirmation && (
              <div className="document-actions">
                <div className="document-actions-copy">
                  <span className="document-actions-icon">
                    <ListChecks size={18} />
                  </span>
                  <div>
                    <strong>等待确认</strong>
                    <span>{thread.confirmation.summary}</span>
                  </div>
                </div>
                <div className="action-list compact">
                  {thread.confirmation.actions.map((action) => (
                    <span key={action.id}>{actionLabel(action.type)}</span>
                  ))}
                </div>
                <div className="confirmation-actions compact">
                  <Button type="button" onClick={onConfirm}>
                    <Check size={16} />
                    确认并安排
                  </Button>
                  <Button type="button" variant="outline" onClick={onRevise}>
                    调整方案
                  </Button>
                </div>
              </div>
            )}
            <div className="markdown-document">
              <Streamdown>{markdownArtifact.content}</Streamdown>
            </div>
          </section>
        )}

        {active === "plan" && thread.plan && (
          <section className="artifact-section">
            <div className="plan-card-header">
              <div>
                <span className="artifact-kicker">方案</span>
                <h3>{thread.plan.title}</h3>
              </div>
              <strong>{Math.round(thread.plan.totalDurationMinutes / 60)}h</strong>
            </div>
            <p>{thread.plan.summary}</p>
            <div className="artifact-metrics">
              <span>预算 {thread.plan.estimatedBudgetCny} 元</span>
              <span>置信度 {Math.round(thread.plan.confidence * 100)}%</span>
            </div>
            <ol className="timeline-list">
              {thread.plan.timeline.map((step) => (
                <li key={step.id}>
                  <time>
                    {step.startTime}-{step.endTime}
                  </time>
                  <div>
                    <strong>{step.title}</strong>
                    <span>
                      <MapPin size={12} />
                      {step.placeName ?? step.address ?? step.type}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
            {thread.plan.risks.length > 0 && (
              <div className="risk-list">
                {thread.plan.risks.map((risk) => (
                  <span key={risk.code}>{risk.message}</span>
                ))}
              </div>
            )}
          </section>
        )}

        {active === "confirmation" && thread.confirmation && (
          <section className="artifact-section confirmation-section">
            <CalendarCheck size={20} />
            <div>
              <span className="artifact-kicker">待确认</span>
              <p>{thread.confirmation.summary}</p>
            </div>
            <div className="action-list">
              {thread.confirmation.actions.map((action) => (
                <span key={action.id}>{actionLabel(action.type)}</span>
              ))}
            </div>
            <div className="confirmation-actions">
              <Button type="button" onClick={onConfirm}>
                <Check size={16} />
                确认并安排
              </Button>
              <Button type="button" variant="outline" onClick={onRevise}>
                调整方案
              </Button>
            </div>
          </section>
        )}

        {active === "receipts" && (
          <section className="artifact-section">
            <div className="receipt-grid">
              {thread.receipts.map((receipt) => (
                <div className="receipt-card" key={receipt.id}>
                  <ReceiptText size={16} />
                  <div>
                    <strong>{receipt.targetName}</strong>
                    <span>
                      {receiptLabel(receipt.type)}
                      {receipt.time ? ` · ${receipt.time}` : ""}
                    </span>
                    <small>{receipt.id}</small>
                  </div>
                  <em>{receiptStatusText(receipt.status)}</em>
                </div>
              ))}
            </div>
          </section>
        )}

        {active === "diagnostics" && (
          <section className="artifact-section diagnostics-section">
            <AlertTriangle size={20} />
            <div>
              <span className="artifact-kicker">诊断</span>
              <p>{thread.failure?.summary ?? "这里保留需要注意的工具失败、跳过和兜底信息。"}</p>
            </div>
            <div className="diagnostic-list">
              {thread.steps
                .filter((step) => step.status === "failed" || step.status === "skipped")
                .map((step) => (
                  <div className={`diagnostic-row ${step.status}`} key={step.id}>
                    <strong>{step.title}</strong>
                    <span>{stepDetail(step)}</span>
                  </div>
                ))}
              {thread.failure && (
                <div className="diagnostic-row failed">
                  <strong>{thread.failure.error.code}</strong>
                  <span>{thread.failure.error.message}</span>
                </div>
              )}
            </div>
            <details className="raw-events">
              <summary>调试事件</summary>
              <pre>{JSON.stringify(thread.events.slice(-20), null, 2)}</pre>
            </details>
          </section>
        )}
      </div>
    </aside>
  );
}

export function ChatWorkspace() {
  const initialDraftId = useMemo(createDraftId, []);
  const [activeThreadId, setActiveThreadId] = useState(initialDraftId);
  const [threads, setThreads] = useState<Record<string, ClientThread>>({
    [initialDraftId]: createEmptyThread(initialDraftId)
  });
  const [input, setInput] = useState(familyPrompt);
  const [isStreaming, setStreaming] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("chat");
  const [artifactJumpTarget, setArtifactJumpTarget] = useState<ArtifactJumpTarget>("top");
  const currentRequestRef = useRef<AbortController | null>(null);

  const activeThread = threads[activeThreadId] ?? createEmptyThread(activeThreadId);
  const recentThreads = Object.values(threads).filter(
    (thread) => !isDraftThread(thread.id) || thread.messages.length > 0
  );
  const canSend = input.trim().length > 0 && !isStreaming;
  const artifactVersion = `${activeThread.activeArtifactId ?? "none"}:${activeThread.artifacts.length}`;

  useEffect(() => {
    if (workspaceView !== "plan") return;
    if (!artifactVersion) return;

    const frame = window.requestAnimationFrame(() => {
      const container = document.querySelector<HTMLElement>(".plan-workspace .artifact-panel-body");
      if (!container) return;

      if (artifactJumpTarget === "top") {
        container.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      const timelineHeading = Array.from(container.querySelectorAll<HTMLElement>(".markdown-document h2")).find(
        (heading) => heading.textContent?.includes("时间线")
      );
      if (!timelineHeading) return;

      const containerRect = container.getBoundingClientRect();
      const headingRect = timelineHeading.getBoundingClientRect();
      container.scrollTo({
        top: container.scrollTop + headingRect.top - containerRect.top - 12,
        behavior: "smooth"
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [workspaceView, artifactJumpTarget, artifactVersion]);

  function startNewChat() {
    const id = createDraftId();
    setActiveThreadId(id);
    setThreads((prev) => ({ ...prev, [id]: createEmptyThread(id) }));
    setInput(familyPrompt);
    setWorkspaceView("chat");
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
    setWorkspaceView("chat");
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

  function setArtifactPanel(open: boolean, selected?: ArtifactTab) {
    setThreads((prev) => {
      const current = prev[activeThreadId] ?? createEmptyThread(activeThreadId);
      return {
        ...prev,
        [activeThreadId]: {
          ...current,
          artifactPanel: {
            open,
            selected: selected ?? current.artifactPanel.selected
          }
        }
      };
    });
  }

  function openPlanView(selected?: ArtifactTab, target: ArtifactJumpTarget = "top") {
    setArtifactJumpTarget(target);
    setWorkspaceView("plan");
    setArtifactPanel(false, selected ?? activeArtifact ?? "document");
  }

  function revisePlan() {
    setInput("我想调整一下：");
    setWorkspaceView("chat");
    setArtifactPanel(false);
  }

  const activeArtifact = selectedArtifact(activeThread);
  const artifactTabs = availableArtifactTabs(activeThread);
  const showArtifactPanel = workspaceView === "chat" && activeThread.artifactPanel.open && Boolean(activeArtifact);
  const workspaceContentClassName =
    workspaceView === "plan"
      ? "workspace-content plan-mode"
      : showArtifactPanel
        ? "workspace-content with-artifact"
        : "workspace-content";
  const composer = (
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
  );

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
            <button
              className={workspaceView === "chat" ? "sidebar-nav active" : "sidebar-nav"}
              type="button"
              onClick={() => setWorkspaceView("chat")}
            >
              <MessageSquare size={16} />
              对话
            </button>
            <button
              className={workspaceView === "plan" ? "sidebar-nav active" : "sidebar-nav"}
              type="button"
              onClick={() => openPlanView(activeArtifact, "top")}
            >
              <Route size={16} />
              方案
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
              <Button
                variant="ghost"
                size="sm"
                type="button"
                disabled={artifactTabs.length === 0}
                onClick={() => openPlanView(activeArtifact, "top")}
              >
                <FileText size={15} />
                产物
              </Button>
            </div>
          </header>

          <div className={workspaceContentClassName}>
            {workspaceView === "plan" ? (
              <PlanWorkspace
                thread={activeThread}
                selected={activeArtifact}
                composer={composer}
                onSelect={(tab) => setArtifactPanel(false, tab)}
                onBack={() => setWorkspaceView("chat")}
                onConfirm={() => void sendMessage("确认，就按这个安排")}
                onRevise={revisePlan}
              />
            ) : (
              <>
                <div className="chat-column">
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

                        {(activeThread.steps.length > 0 ||
                          activeThread.plan ||
                          activeThread.receipts.length > 0 ||
                          activeThread.failure) && (
                          <article className="message assistant">
                            <RunActivityPanel thread={activeThread} openArtifact={openPlanView} />
                          </article>
                        )}
                      </div>
                    )}
                  </section>

                  {composer}
                </div>

                {showArtifactPanel && (
                  <ArtifactPanel
                    thread={activeThread}
                    selected={activeArtifact}
                    onSelect={(tab) => setArtifactPanel(true, tab)}
                    onClose={() => setArtifactPanel(false)}
                    onConfirm={() => void sendMessage("确认，就按这个安排")}
                    onRevise={revisePlan}
                  />
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
