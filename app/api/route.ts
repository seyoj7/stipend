import { NextResponse } from "next/server";
import { runAgent } from "@/backend/agent";
import { getAgentBlockedInvoices, getAgentOpenInvoices } from "@/backend/invoices";
import { setLastAgentRun } from "@/backend/run-status";
import { getAgentHealth, getAgentStatus } from "@/backend/status";

export const runtime = "nodejs";
export const maxDuration = 300;

type RunDecision = { decision?: string };

async function handleRun(request: Request, signedRequest?: { timestamp: number; signature: `0x${string}` }) {
  try {
    const result = await runAgent(request.headers.get("authorization"), signedRequest);
    if (result.status === 200) {
      const decisions = (result.body as { decisions?: RunDecision[] }).decisions ?? [];
      setLastAgentRun({
        at: new Date().toISOString(),
        result: "completed",
        paid: decisions.filter((item) => item.decision === "paid").length,
        blocked: decisions.filter((item) => item.decision === "blocked" || item.decision === "rejected").length,
        errors: decisions.filter((item) => item.decision === "error").length,
      });
    } else if (result.status >= 500) {
      setLastAgentRun({ at: new Date().toISOString(), result: "failed", paid: 0, blocked: 0, errors: 0 });
    }
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error("[stipend-agent] Run request failed", error);
    setLastAgentRun({ at: new Date().toISOString(), result: "failed", paid: 0, blocked: 0, errors: 0 });
    return NextResponse.json({ error: "Agent run failed. Check the server logs." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const action = new URL(request.url).searchParams.get("action");

  if (action === "status") {
    return NextResponse.json(getAgentStatus());
  }

  if (action === "health") {
    try {
      return NextResponse.json(await getAgentHealth(), { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      console.error("[stipend-agent] Health check failed", error);
      return NextResponse.json({ message: "Could not read health data from Aevum." }, { status: 500 });
    }
  }

  if (action === "invoices") {
    try {
      const invoices = await getAgentOpenInvoices();
      return NextResponse.json({ invoices });
    } catch (error) {
      console.error("[stipend-agent] Invoice lookup failed", error);
      return NextResponse.json({ error: "Could not load open invoices." }, { status: 500 });
    }
  }

  if (action === "blocked-invoices") {
    try {
      const invoices = await getAgentBlockedInvoices();
      return NextResponse.json({ invoices }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      console.error("[stipend-agent] Blocked invoice lookup failed", error);
      return NextResponse.json({ error: "Could not load blocked invoices." }, { status: 500 });
    }
  }

  if (action === "run") {
    return handleRun(request);
  }

  return NextResponse.json({ error: "Unknown API action." }, { status: 404 });
}

export async function POST(request: Request) {
  const action = new URL(request.url).searchParams.get("action");
  if (action !== "run") {
    return NextResponse.json({ error: "Unknown API action." }, { status: 404 });
  }

  let signedRequest: { timestamp: number; signature: `0x${string}` } | undefined;
  if (!request.headers.get("authorization")) {
    try {
      signedRequest = await request.json();
    } catch {
      // Token-authenticated scheduler calls do not need a request body.
    }
  }

  return handleRun(request, signedRequest);
}
