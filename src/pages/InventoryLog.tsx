import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import LogTab from "@/components/inventory/LogTab";
import BackButton from "@/components/BackButton";
import { useOrgRole } from "@/hooks/useOrgRole";

const InventoryLog = () => {
  const { orgId } = useOrgRole();

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <BackButton className="mb-4" />
        {orgId && <LogTab orgId={orgId} />}
      </main>
      <AppFooter />
    </div>
  );
};

export default InventoryLog;
