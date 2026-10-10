import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDriveRoot } from "@/lib/data";
import { handle } from "@/lib/api";
import {
  accessTokenFromRefresh,
  listFolder,
  driveConfigured,
} from "@/lib/googleDrive";

/** List the children of a Drive folder (defaults to the Briology root). */
export async function GET(request: NextRequest) {
  return handle(async () => {
    await requireUser();
    const root = await getDriveRoot();
    if (!root) return NextResponse.json({ connected: false, items: [] });
    if (!driveConfigured()) {
      return NextResponse.json({
        connected: true,
        items: [],
        error: "Drive is not configured.",
      });
    }

    const folderId =
      new URL(request.url).searchParams.get("folder") || root.folderId;

    try {
      const accessToken = await accessTokenFromRefresh(root.refreshToken);
      const items = await listFolder(accessToken, folderId);
      return NextResponse.json({ connected: true, folderId, items });
    } catch (err) {
      return NextResponse.json({
        connected: true,
        items: [],
        error:
          "Could not read Drive: " +
          (err instanceof Error ? err.message : String(err)),
      });
    }
  });
}
