import { CHAIN, getNetworkStatus } from "@/lib/rhchain";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ ...CHAIN, ...(await getNetworkStatus()) });
  } catch (e) {
    return Response.json({ ...CHAIN, error: (e as Error).message }, { status: 502 });
  }
}
