import getCurrentUser from "@/app/actions/getCurrentUser";
import { canManageServices, isAdminEmail } from "@/lib/adminAuth";
import RegistryDashboard from "@/components/registry/RegistryDashboard";
import RegistrySignIn from "@/components/registry/RegistrySignIn";

export const dynamic = "force-dynamic";
export default async function RobotRegistry() {
  const user = await getCurrentUser();
  if (!user) return <RegistrySignIn />;
  // Owners submit and maintain their own machines here; administrators see
  // every robot and the controls that confer identity. The API enforces both,
  // so this only decides what is worth rendering.
  if (!canManageServices(user))
    return (
      <main className="mx-auto max-w-4xl p-8">
        A provider or administrator account is required.
      </main>
    );
  return (
    <RegistryDashboard
      environment={process.env.REGISTRY_ENVIRONMENT || "unconfigured"}
      canAdminister={isAdminEmail(user.email)}
    />
  );
}
