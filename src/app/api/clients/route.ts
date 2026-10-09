import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireAdmin } from "@/lib/auth";
import { listClients, createClientWithSections } from "@/lib/data";
import { handle } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const clients = await listClients(user);
    return NextResponse.json({ clients });
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    await requireAdmin();
    const body = (await request.json()) as { name?: string };
    const name = (body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }
    const client = await createClientWithSections(name);
    return NextResponse.json({ client });
  });
}
