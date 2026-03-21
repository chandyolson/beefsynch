import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { OrgRoleProvider } from "@/hooks/useOrgRole";
import Index from "./pages/Index";
import ProjectDetail from "./pages/ProjectDetail";
import MasterCalendar from "./pages/MasterCalendar";
import BullList from "./pages/BullList";
import BullReport from "./pages/BullReport";
import BullChat from "./pages/BullChat";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Onboarding from "./pages/Onboarding";
import AcceptInvite from "./pages/AcceptInvite";
import NotFound from "./pages/NotFound";
import TeamManagement from "./pages/TeamManagement";
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

            {/* Protected routes */}
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/project/:id" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
            <Route path="/calendar" element={<ProtectedRoute><MasterCalendar /></ProtectedRoute>} />
            <Route path="/bulls" element={<ProtectedRoute><BullList /></ProtectedRoute>} />
            <Route path="/bull-report" element={<ProtectedRoute><BullReport /></ProtectedRoute>} />
            <Route path="/chat" element={<ProtectedRoute><BullChat /></ProtectedRoute>} />
            <Route path="/team" element={<ProtectedRoute><TeamManagement /></ProtectedRoute>} />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </OrgRoleProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
