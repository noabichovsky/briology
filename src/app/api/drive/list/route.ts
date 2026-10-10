import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDriveRoot, getClientMemberByEmail } from "@/lib/data";
import { handle } from "@/lib/api";
import {
  accessTokenFromRefresh,
  listFolder,
  isWithinFolder,
  driveConfigured,
} from "@/lib/googleDrive";

/** List a Drive folder's children, scoped to what the user may see. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const root = await getDriveRoot();
    if (!root) return NextResponse.json({ connected: false, items: [] });
    if (!driveConfigured()) {
      return NextResponse.json({
        connected: true,
        items: [],
        error: "Drive is not configured.",
      });
    }

    // Decide this user's root folder + label.
    let rootFolderId = root.folderId;
    let rootName = "Briology";
    if (user.role !== "admin") {
      const member = await getClientMemberByEmail(user.email);
      if (!member) {
        return NextResponse.json({
          connected: true,
          role: user.role,
          items: [],
          error: "No workspace has been assigned to your account yet.",
        });
      }
      rootFolderId = member.folderId;
      rootName = member.folderName;
    }

    const requested =
      new URL(request.url).searchParams.get("folder") || rootFolderId;

    try {
      const accessToken = await accessTokenFromRefresh(root.refreshToken);
      // Clients may only read inside their own folder.
      if (user.role !== "admin" && requested !== rootFolderId) {
        const ok = await isWithinFolder(accessToken, requested, rootFolderId);
        if (!ok) return new Response("Forbidden", { status: 403 });
      }
      const items = await listFolder(accessToken, requested);
      return NextResponse.json({
        connected: true,
        role: user.role,
        rootFolderId,
        rootName,
        folderId: requested,
        items,
      });
    } catch (err) {
      return NextResponse.json({
        connected: true,
        role: user.role,
        rootFolderId,
        rootName,
        items: [],
        error:
          "Could not read Drive: " +
          (err instanceof Error ? err.message : String(err)),
      });
    }
  });
}
