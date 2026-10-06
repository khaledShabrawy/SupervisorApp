import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/contexts/AuthContext';
import { AppSettingsProvider } from '@/contexts/AppSettingsContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import LoadingSpinner from '@/components/LoadingSpinner';
import Toast from '@/components/Toast';
import { RequireAuth } from '@/components/Layout';
import { RequireScreen } from '@/components/RequireScreen';
import AdminLayout from '@/admin/AdminLayout';

const Login = lazy(() => import('@/screens/LoginScreen'));
const Dashboard = lazy(() => import('@/screens/DashboardScreen'));
const Visits = lazy(() => import('@/screens/VisitsScreen'));
const NewVisit = lazy(() => import('@/screens/NewVisitScreen'));
const VisitDetail = lazy(() => import('@/screens/VisitDetailScreen'));
const ShelfAudit = lazy(() => import('@/screens/ShelfAuditScreen'));
const Competitors = lazy(() => import('@/screens/CompetitorScreen'));
const Customers = lazy(() => import('@/screens/CustomersScreen'));
const Targets = lazy(() => import('@/screens/TargetsScreen'));
const BeatPlan = lazy(() => import('@/screens/BeatPlanScreen'));
const Notifications = lazy(() => import('@/screens/NotificationsScreen'));
const SetPassword = lazy(() => import('@/screens/SetPasswordScreen'));
const AdminDashboard = lazy(() => import('@/admin/AdminDashboard'));
const AdminUsers = lazy(() => import('@/admin/AdminUsers'));
const section = (name: 'AdminBranches' | 'AdminCustomers' | 'AdminProducts' | 'AdminTargets' | 'AdminAssets' | 'AdminNotifications' | 'AdminSettings') =>
  lazy(() => import('@/admin/AdminSections').then((m) => ({ default: m[name] })));
const AdminBranches = section('AdminBranches'), AdminCustomers = section('AdminCustomers'), AdminProducts = section('AdminProducts'),
  AdminTargets = section('AdminTargets'), AdminAssets = section('AdminAssets'), AdminNotifications = section('AdminNotifications'),
  AdminSettings = section('AdminSettings');
const NotFound = lazy(() => import('@/pages/NotFound'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { gcTime: 0, staleTime: 15_000, refetchOnWindowFocus: true } },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppSettingsProvider>
          <ErrorBoundary>
            <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Suspense fallback={<LoadingSpinner />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/set-password" element={<SetPassword />} />
                  <Route path="/admin" element={<AdminLayout />}>
                    <Route index element={<AdminDashboard />} />
                    <Route path="users" element={<AdminUsers />} />
                    <Route path="branches" element={<AdminBranches />} />
                    <Route path="customers" element={<AdminCustomers />} />
                    <Route path="products" element={<AdminProducts />} />
                    <Route path="targets" element={<AdminTargets />} />
                    <Route path="assets" element={<AdminAssets />} />
                    <Route path="notifications" element={<AdminNotifications />} />
                    <Route path="settings" element={<AdminSettings />} />
                  </Route>
                  <Route element={<RequireAuth />}>
                    <Route index element={<Dashboard />} />
                    <Route path="visits" element={<Visits />} />
                    <Route path="visits/new" element={<RequireScreen screen="new_visit"><NewVisit /></RequireScreen>} />
                    <Route path="visits/:id" element={<VisitDetail />} />
                    <Route path="shelf-audit" element={<RequireScreen screen="shelf_audit"><ShelfAudit /></RequireScreen>} />
                    <Route path="competitors" element={<RequireScreen screen="competitor_products"><Competitors /></RequireScreen>} />
                    <Route path="customers" element={<Customers />} />
                    <Route path="targets" element={<RequireScreen screen="my_reports"><Targets /></RequireScreen>} />
                    <Route path="beat-plan" element={<RequireScreen screen="beat_plan"><BeatPlan /></RequireScreen>} />
                    <Route path="notifications" element={<RequireScreen screen="notifications"><Notifications /></RequireScreen>} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
              <Toast />
            </BrowserRouter>
          </ErrorBoundary>
        </AppSettingsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;