import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { RouteGuard } from "@/components/RouteGuard";

// Pages
import Login from "./pages/Login";
import MainLayout from "./components/layout/MainLayout";
import Dashboard from "./pages/Dashboard";
import RequestDelivery from "./pages/RequestDelivery";
import PlanOrder from "./pages/PlanOrder";
import StockIn from "./pages/StockIn";
import SalesOrder from "./pages/SalesOrder";
import StockOut from "./pages/StockOut";
import StockAdjustment from "./pages/StockAdjustment";
import DataStock from "./pages/DataStock";
import UserManagement from "./pages/UserManagement";
import SettingsPage from "./pages/Settings";

// Data Product
import Products from "./pages/data-product/Products";
import Categories from "./pages/data-product/Categories";
import Units from "./pages/data-product/Units";
import Suppliers from "./pages/data-product/Suppliers";
import Customers from "./pages/data-product/Customers";

// Reports
import StockReport from "./pages/reports/StockReport";
import InboundReport from "./pages/reports/InboundReport";
import OutboundReport from "./pages/reports/OutboundReport";
import AdjustmentLog from "./pages/reports/AdjustmentLog";
import AuditLog from "./pages/reports/AuditLog";
import StockMovement from "./pages/reports/StockMovement";
import ExpiryAlert from "./pages/reports/ExpiryAlert";
import Profile from "./pages/Profile";

import TrackerPO from "./pages/TrackerPO";
import NotFound from "./pages/NotFound";
import Notifications from "./pages/Notifications";
import DeliveryOrder from "./pages/DeliveryOrder";
import ProformaInvoice from "./pages/ProformaInvoice";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                
                <Route element={<MainLayout />}>
                  {/* Dashboard - All roles */}
                  <Route path="/dashboard" element={
                    <RouteGuard menuKey="dashboard">
                      <Dashboard />
                    </RouteGuard>
                  } />
                  <Route path="/request-delivery" element={
                    <RouteGuard menuKey="requestDelivery">
                      <RequestDelivery />
                    </RouteGuard>
                  } />
                  <Route path="/tracker-po" element={
                    <RouteGuard menuKey="trackerPO">
                      <TrackerPO />
                    </RouteGuard>
                  } />
                  
                  {/* Transactions */}
                  <Route path="/plan-order" element={
                    <RouteGuard menuKey="planOrder">
                      <PlanOrder />
                    </RouteGuard>
                  } />
                  <Route path="/stock-in" element={
                    <RouteGuard menuKey="stockIn">
                      <StockIn />
                    </RouteGuard>
                  } />
                  <Route path="/sales-order" element={
                    <RouteGuard menuKey="salesOrder">
                      <SalesOrder />
                    </RouteGuard>
                  } />
                  <Route path="/stock-out" element={
                    <RouteGuard menuKey="stockOut">
                      <StockOut />
                    </RouteGuard>
                  } />
                  <Route path="/stock-adjustment" element={
                    <RouteGuard menuKey="stockAdjustment">
                      <StockAdjustment />
                    </RouteGuard>
                  } />
                  <Route path="/delivery-order" element={
                    <RouteGuard menuKey="deliveryOrder">
                      <DeliveryOrder />
                    </RouteGuard>
                  } />
                  <Route path="/proforma-invoice" element={
                    <RouteGuard menuKey="proformaInvoice">
                      <ProformaInvoice />
                    </RouteGuard>
                  } />
                  
                  {/* Master Data */}
                  <Route path="/data-product/products" element={
                    <RouteGuard menuKey="products">
                      <Products />
                    </RouteGuard>
                  } />
                  <Route path="/data-product/categories" element={
                    <RouteGuard menuKey="categories">
                      <Categories />
                    </RouteGuard>
                  } />
                  <Route path="/data-product/units" element={
                    <RouteGuard menuKey="units">
                      <Units />
                    </RouteGuard>
                  } />
                  <Route path="/data-product/suppliers" element={
                    <RouteGuard menuKey="suppliers">
                      <Suppliers />
                    </RouteGuard>
                  } />
                  <Route path="/data-product/customers" element={
                    <RouteGuard menuKey="customers">
                      <Customers />
                    </RouteGuard>
                  } />
                  <Route path="/data-stock" element={
                    <RouteGuard menuKey="dataStock">
                      <DataStock />
                    </RouteGuard>
                  } />
                  
                  {/* Admin Only - super_admin */}
                  <Route path="/user-management" element={
                    <RouteGuard menuKey="userManagement">
                      <UserManagement />
                    </RouteGuard>
                  } />
                  <Route path="/settings" element={
                    <RouteGuard menuKey="settings">
                      <SettingsPage />
                    </RouteGuard>
                  } />
                  
                  {/* Profile & Notifications - Always accessible */}
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/notifications" element={<Notifications />} />
                  
                  {/* Reports */}
                  <Route path="/reports/stock" element={
                    <RouteGuard menuKey="stockReport">
                      <StockReport />
                    </RouteGuard>
                  } />
                  <Route path="/reports/inbound" element={
                    <RouteGuard menuKey="inboundReport">
                      <InboundReport />
                    </RouteGuard>
                  } />
                  <Route path="/reports/outbound" element={
                    <RouteGuard menuKey="outboundReport">
                      <OutboundReport />
                    </RouteGuard>
                  } />
                  <Route path="/reports/movement" element={
                    <RouteGuard menuKey="stockMovement">
                      <StockMovement />
                    </RouteGuard>
                  } />
                  <Route path="/reports/expiry" element={
                    <RouteGuard menuKey="expiryAlert">
                      <ExpiryAlert />
                    </RouteGuard>
                  } />
                  <Route path="/reports/adjustment" element={
                    <RouteGuard menuKey="adjustmentLog">
                      <AdjustmentLog />
                    </RouteGuard>
                  } />
                  <Route path="/reports/audit" element={
                    <RouteGuard menuKey="auditLog">
                      <AuditLog />
                    </RouteGuard>
                  } />
                </Route>
                
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
