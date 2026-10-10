import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertClientAccess, getDriveLink } from "@/lib/data";
import { handle } from "@/lib/api";
import {
  accessTokenFromRefresh,
  listFolder,
  driveConfigured,
} from "@/lib/googleDrive";

/** Read the connected Drive folder's files for a client. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const clientId = new URL(request.url).searchParams.get("client") ?? "";
    if (!clientId) {
      return NextResponse.json({ error: "client required" }, { status: 400 });
    }
    assertClientAccess(user, clientId);

    const link = await getDriveLink(clientId);
    if (!link) {
      return NextResponse.json({ connected: false, files: [] });
    }
    if (!driveConfigured()) {
      return NextResponse.json(
        { connected: true, files: [], error: "Drive is not configured." },
        { status: 200 }
      );
    }

    try {
      const accessToken = await accessTokenFromRefresh(link.refreshToken);
      const files = await listFolder(accessToken, link.folderId);
      return NextResponse.json({
        connected: true,
        folderId: link.folderId,
        files,
      });
    } catch (err) {
      return NextResponse.json(
        {
          connected: true,
          files: [],
          error:
            "Could not read the Drive folder: " +
            (err instanceof Error ? err.message : String(err)),
        },
        { status: 200 }
      );
    }
  });
}
