import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import TanksTabContent from "@/components/inventory/TanksTabContent";
import { useOrgRole } from "@/hooks/useOrgRole";

const TanksDashboard = () => {
  const { orgId, orgName, userId } = useOrgRole();

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 space-y-6">
        <div>
          <h2 className="text-2xl font-bold font-display tracking-tight">Tank Management</h2>
        </div>
        {orgId && <TanksTabContent orgId={orgId} orgName={orgName ?? null} userId={userId ?? null} />}
      </main>
      <AppFooter />
    </div>
  );
};

export default TanksDashboard;
