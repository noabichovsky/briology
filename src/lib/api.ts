import { NextResponse } from "next/server";

/**
 * Wrap a route handler so that `throw new Response(...)` from auth guards
 * (requireUser / requireAdmin / assertClientAccess) becomes a clean HTTP
 * response instead of a 500.
 */
export async function handle(
  fn: () => Promise<Response>
): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}
