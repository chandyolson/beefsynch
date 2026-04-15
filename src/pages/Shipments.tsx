import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import BackButton from "@/components/BackButton";
import ReceivingTab from "@/components/inventory/ReceivingTab";
import { useOrgRole } from "@/hooks/useOrgRole";

const Shipments = () => {
  const { orgId } = useOrgRole();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-6 space-y-6 max-w-6xl">
        <BackButton />
        {orgId && <ReceivingTab orgId={orgId} />}
      </main>
      <AppFooter />
    </div>
  );
};

export default Shipments;
