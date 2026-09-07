import getCurrentUser from "@/app/actions/getCurrentUser";
import { isAdminEmail } from "@/lib/adminAuth";
import RegistryDashboard from "@/components/registry/RegistryDashboard";
import RegistrySignIn from "@/components/registry/RegistrySignIn";

export const dynamic = "force-dynamic";
export default async function RobotRegistry() {
  const user = await getCurrentUser();
  if (!user) return <RegistrySignIn />;
  if (!isAdminEmail(user.email))
    return (
      <main className="mx-auto max-w-4xl p-8">
        Administrator access required.
      </main>
    );
  return (
    <RegistryDashboard
      environment={process.env.REGISTRY_ENVIRONMENT || "unconfigured"}
    />
  );
}
