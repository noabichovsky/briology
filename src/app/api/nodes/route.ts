import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  assertClientAccess,
  sectionClientId,
  createFolder,
  createFileFromUpload,
} from "@/lib/data";
import { handle } from "@/lib/api";

export async function POST(request: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const contentType = request.headers.get("content-type") ?? "";

    // --- File upload (multipart) ---
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const sectionId = String(form.get("section_id") ?? "");
      const parentRaw = form.get("parent_id");
      const parentId = parentRaw ? String(parentRaw) : null;
      const files = form.getAll("files").filter((f): f is File => f instanceof File);

      if (!sectionId || files.length === 0) {
        return NextResponse.json(
          { error: "section_id and at least one file are required." },
          { status: 400 }
        );
      }
      const clientId = await sectionClientId(sectionId);
      if (!clientId)
        return NextResponse.json({ error: "Unknown section." }, { status: 404 });
      assertClientAccess(user, clientId);

      const created = [];
      for (const file of files) {
        created.push(
          await createFileFromUpload(sectionId, parentId, file, user.id)
        );
      }
      return NextResponse.json({ nodes: created });
    }

    // --- New folder (JSON) ---
    const body = (await request.json()) as {
      section_id?: string;
      parent_id?: string | null;
      name?: string;
    };
    const sectionId = body.section_id ?? "";
    if (!sectionId) {
      return NextResponse.json(
        { error: "section_id is required." },
        { status: 400 }
      );
    }
    const clientId = await sectionClientId(sectionId);
    if (!clientId)
      return NextResponse.json({ error: "Unknown section." }, { status: 404 });
    assertClientAccess(user, clientId);

    const node = await createFolder(
      sectionId,
      body.parent_id ?? null,
      body.name ?? "Untitled folder",
      user.id
    );
    return NextResponse.json({ node });
  });
}
