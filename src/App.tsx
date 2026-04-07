import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { OrgRoleProvider } from "@/hooks/useOrgRole";
import Index from "./pages/Index";
import RootRedirect from "./components/RootRedirect";
import ProjectDetail from "./pages/ProjectDetail";
import MasterCalendar from "./pages/MasterCalendar";
import BullList from "./pages/BullList";
import BullReport from "./pages/BullReport";
import BullChat from "./pages/BullChat";
import SemenOrders from "./pages/SemenOrders";
import SemenOrderDetail from "./pages/SemenOrderDetail";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Tanks from "./pages/Tanks";
import ReInventory from "./pages/ReInventory";
import TankDetail from "./pages/TankDetail";
import TankFills from "./pages/TankFills";
import TanksOut from "./pages/TanksOut";
import SemenInventory from "./pages/SemenInventory";
import ReceiveShipment from "./pages/ReceiveShipment";
import ReceiveShipmentPreview from "./pages/ReceiveShipmentPreview";
import TanksDashboard from "./pages/TanksDashboard";
import InventoryDashboard from "./pages/InventoryDashboard";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Onboarding from "./pages/Onboarding";
import AcceptInvite from "./pages/AcceptInvite";
import NotFound from "./pages/NotFound";
import TeamManagement from "./pages/TeamManagement";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import PackTank from "./pages/PackTank";
import Shipments from "./pages/Shipments";
import PackDetail from "./pages/PackDetail";
import UnpackTank from "./pages/UnpackTank";
import Unpacks from "./pages/Unpacks";
import ProjectBilling from "./pages/ProjectBilling";
import ProtectedRoute from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <OrgRoleProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />

            {/* Root: public landing or redirect to dashboard */}
            <Route path="/" element={<RootRedirect />} />

            {/* Protected routes */}
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/dashboard" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/project/:id" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
            <Route path="/project/:id/billing" element={<ProtectedRoute><ProjectBilling /></ProtectedRoute>} />
            <Route path="/calendar" element={<ProtectedRoute><MasterCalendar /></ProtectedRoute>} />
            <Route path="/bulls" element={<ProtectedRoute><BullList /></ProtectedRoute>} />
            <Route path="/semen-orders" element={<ProtectedRoute><SemenOrders /></ProtectedRoute>} />
            <Route path="/semen-orders/:id" element={<ProtectedRoute><SemenOrderDetail /></ProtectedRoute>} />
            <Route path="/bull-report" element={<ProtectedRoute><BullReport /></ProtectedRoute>} />
            <Route path="/chat" element={<ProtectedRoute><BullChat /></ProtectedRoute>} />
            <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
            <Route path="/customers/:id" element={<ProtectedRoute><CustomerDetail /></ProtectedRoute>} />
            <Route path="/tanks" element={<ProtectedRoute><Tanks /></ProtectedRoute>} />
            <Route path="/tanks/:id" element={<ProtectedRoute><TankDetail /></ProtectedRoute>} />
            <Route path="/tanks/:tankId/reinventory" element={<ProtectedRoute><ReInventory /></ProtectedRoute>} />
            <Route path="/tank-fills" element={<ProtectedRoute><TankFills /></ProtectedRoute>} />
            <Route path="/tanks-out" element={<ProtectedRoute><TanksOut /></ProtectedRoute>} />
            <Route path="/semen-inventory" element={<ProtectedRoute><SemenInventory /></ProtectedRoute>} />
            <Route path="/receive-shipment" element={<ProtectedRoute><ReceiveShipment /></ProtectedRoute>} />
            <Route path="/receive-shipment/preview/:id" element={<ProtectedRoute><ReceiveShipmentPreview /></ProtectedRoute>} />
            <Route path="/receive-shipment/:id" element={<ProtectedRoute><ReceiveShipment /></ProtectedRoute>} />
            <Route path="/shipments" element={<ProtectedRoute><Shipments /></ProtectedRoute>} />
            <Route path="/tanks-dashboard" element={<ProtectedRoute><TanksDashboard /></ProtectedRoute>} />
            <Route path="/inventory-dashboard" element={<ProtectedRoute><InventoryDashboard /></ProtectedRoute>} />
            <Route path="/team" element={<ProtectedRoute><TeamManagement /></ProtectedRoute>} />
            <Route path="/pack-tank" element={<ProtectedRoute><PackTank /></ProtectedRoute>} />
            <Route path="/pack/:id" element={<ProtectedRoute><PackDetail /></ProtectedRoute>} />
            <Route path="/unpack/:packId" element={<ProtectedRoute><UnpackTank /></ProtectedRoute>} />
            <Route path="/unpacks" element={<ProtectedRoute><Unpacks /></ProtectedRoute>} />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </OrgRoleProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
