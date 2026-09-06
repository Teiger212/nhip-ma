import { createWalkBypassResponse } from "@inbox/lib/walk-bypass";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
	return createWalkBypassResponse(request);
}
