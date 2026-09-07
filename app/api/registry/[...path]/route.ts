import getCurrentUser from "@/app/actions/getCurrentUser";
import { registryDatabase } from "@/lib/registry/client";
import { createRegistryHandler } from "@/lib/registry/http";

export const dynamic = "force-dynamic";
async function handle(request: Request) {
  try {
    return await createRegistryHandler({
      db: registryDatabase(),
      actor: getCurrentUser,
    })(request);
  } catch {
    return new Response(
      JSON.stringify({ error: "Robot registry is not configured." }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
