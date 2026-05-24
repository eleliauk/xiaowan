"use client";

import { useMemo, useState } from "react";
import type { AgentRunOutput, ToolCallTrace } from "@mh/shared";

const familyPrompt = "今天下午是空的，想和老婆孩子出去玩几个小时，别离家太远，帮我安排一下。";
const friendsPrompt = "今天下午我们 4 个朋友，2 男 2 女，想出去玩几个小时，吃饭也一起安排，别太远。";

function traceLabel(trace: ToolCallTrace) {
  if (trace.status === "failed") {
    return trace.error?.code ?? "FAILED";
  }

  if (trace.toolName.includes("Availability")) {
    return "可用";
  }

  if (trace.toolName.includes("Queue")) {
    return "排队已查";
  }

  return "完成";
}

export function Workbench() {
  const [message, setMessage] = useState(familyPrompt);
  const [session, setSession] = useState<AgentRunOutput | null>(null);
  const [isPlanning, setPlanning] = useState(false);
  const [isExecuting, setExecuting] = useState(false);
  const finalMessage = useMemo(() => {
    const sendReceipt = session?.executionReceipts.find((receipt) => receipt.type === "message_send");
    if (sendReceipt) {
      return String(sendReceipt.details.preview ?? "");
    }
    return session?.plan?.requiredActions.find((action) => action.type === "send_message")?.input
      ? String((session.plan.requiredActions.find((action) => action.type === "send_message")?.input as { content?: string }).content)
      : "";
  }, [session]);

  async function plan(nextMessage = message) {
    setPlanning(true);
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: nextMessage, sessionId: session?.sessionId })
      });
      setSession(await response.json());
    } finally {
      setPlanning(false);
    }
  }

  async function execute() {
    if (!session?.plan) {
      return;
    }

    setExecuting(true);
    try {
      const response = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.sessionId, planId: session.plan.id })
      });
      setSession(await response.json());
    } finally {
      setExecuting(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Local Activity Agent</p>
          <h1>下午去哪、吃什么、怎么安排，一次搞定</h1>
        </div>
        <div className="status">{session?.state ?? "READY"}</div>
      </header>

      <section className="grid">
        <aside className="panel chat">
          <div className="panelHeader">
            <h2>目标</h2>
          </div>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            aria-label="自然语言目标"
          />
          <div className="quickActions">
            <button
              type="button"
              onClick={() => {
                setMessage(familyPrompt);
                void plan(familyPrompt);
              }}
            >
              家庭场景
            </button>
            <button
              type="button"
              onClick={() => {
                setMessage(friendsPrompt);
                void plan(friendsPrompt);
              }}
            >
              朋友场景
            </button>
          </div>
          <button className="primary" type="button" disabled={isPlanning} onClick={() => void plan()}>
            {isPlanning ? "规划中..." : "生成方案"}
          </button>
          <div className="assistantBox">
            {session?.messages.at(-1)?.content ?? "输入一句话，我会生成可执行计划并展示工具调用链路。"}
          </div>
        </aside>

        <section className="panel timeline">
          <div className="panelHeader">
            <h2>{session?.plan?.title ?? "计划时间线"}</h2>
            <span>{session?.plan ? `${session.plan.totalDurationMinutes} 分钟` : "等待规划"}</span>
          </div>
          {session?.plan ? (
            <>
              <p className="summary">{session.plan.summary}</p>
              <ol className="steps">
                {session.plan.timeline.map((step) => (
                  <li key={step.id}>
                    <time>
                      {step.startTime} - {step.endTime}
                    </time>
                    <div>
                      <strong>{step.title}</strong>
                      <span>{step.placeName ?? step.address ?? step.type}</span>
                      <p>{step.notes.join(" / ")}</p>
                    </div>
                  </li>
                ))}
              </ol>
              {session.plan.risks.length > 0 && (
                <div className="riskBox">
                  {session.plan.risks.map((risk) => (
                    <p key={risk.code}>{risk.message}</p>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="empty">方案会在这里变成一条下午时间线。</div>
          )}
        </section>

        <aside className="panel traces">
          <div className="panelHeader">
            <h2>工具调用</h2>
            <span>{session?.toolTraces.length ?? 0}</span>
          </div>
          <div className="traceList">
            {session?.toolTraces.map((trace) => (
              <div className={`trace ${trace.status}`} key={trace.id}>
                <div>
                  <strong>{trace.toolName}</strong>
                  <span>{traceLabel(trace)}</span>
                </div>
                <p>{trace.error?.message ?? JSON.stringify(trace.output).slice(0, 110)}</p>
              </div>
            )) ?? <div className="empty">查询、校验、repair 和执行记录会显示在这里。</div>}
          </div>
        </aside>
      </section>

      <section className="execution">
        <div>
          <p className="eyebrow">Execution</p>
          <h2>确认后再安排预约、配送和消息</h2>
          {finalMessage && <p className="finalMessage">{finalMessage}</p>}
        </div>
        <div className="receiptList">
          {session?.executionReceipts.map((receipt) => (
            <div className="receipt" key={receipt.id}>
              <strong>{receipt.targetName}</strong>
              <span>{receipt.id}</span>
              <em>{receipt.status}</em>
            </div>
          ))}
        </div>
        <button
          className="primary executeButton"
          type="button"
          disabled={!session?.plan || session.state !== "READY_FOR_CONFIRMATION" || isExecuting}
          onClick={() => void execute()}
        >
          {isExecuting ? "安排中..." : "确认并一键安排"}
        </button>
      </section>
    </main>
  );
}
