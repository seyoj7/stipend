import { NextResponse } from "next/server";
import { runAgent } from "@/backend/agent";
import { getAgentOpenInvoices } from "@/backend/invoices";
import { getAgentStatus } from "@/backend/status";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const action = new URL(request.url).searchParams.get("action");

  if (action === "status") {
    return NextResponse.json(getAgentStatus());
  }

  if (action === "invoices") {
    const invoices = await getAgentOpenInvoices();
    return NextResponse.json({ invoices });
  }

  return NextResponse.json({ error: "Unknown API action." }, { status: 404 });
}

export async function POST(request: Request) {
  const action = new URL(request.url).searchParams.get("action");
  if (action !== "run") {
    return NextResponse.json({ error: "Unknown API action." }, { status: 404 });
  }

  let signedRequest: { timestamp: number; signature: `0x${string}` } | undefined;
  try {
    signedRequest = await request.json();
  } catch {
    // Cron callers can authenticate with the server-only bearer token and no body.
  }

  const result = await runAgent(request.headers.get("authorization"), signedRequest);
  return NextResponse.json(result.body, { status: result.status });
}
