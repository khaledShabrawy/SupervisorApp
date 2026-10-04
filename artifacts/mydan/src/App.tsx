import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/contexts/AuthContext';
import { AppSettingsProvider } from '@/contexts/AppSettingsContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import LoadingSpinner from '@/components/LoadingSpinner';
import Toast from '@/components/Toast';
import { RequireAdmin, RequireAuth } from '@/components/Layout';

const Login = lazy(() => import('@/screens/LoginScreen'));
const Dashboard = lazy(() => import('@/screens/DashboardScreen'));
const Visits = lazy(() => import('@/screens/VisitsScreen'));
const NewVisit = lazy(() => import('@/screens/NewVisitScreen'));
const ShelfAudit = lazy(() => import('@/screens/ShelfAuditScreen'));
const Orders = lazy(() => import('@/screens/OrdersScreen'));
const Customers = lazy(() => import('@/screens/CustomersScreen'));
const Targets = lazy(() => import('@/screens/TargetsScreen'));
const BeatPlan = lazy(() => import('@/screens/BeatPlanScreen'));
const Notifications = lazy(() => import('@/screens/NotificationsScreen'));
const Admin = lazy(() => import('@/screens/AdminPanel'));
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
                  <Route element={<RequireAuth />}>
                    <Route index element={<Dashboard />} />
                    <Route path="visits" element={<Visits />} />
                    <Route path="visits/new" element={<NewVisit />} />
                    <Route path="shelf-audit" element={<ShelfAudit />} />
                    <Route path="orders" element={<Orders />} />
                    <Route path="customers" element={<Customers />} />
                    <Route path="targets" element={<Targets />} />
                    <Route path="beat-plan" element={<BeatPlan />} />
                    <Route path="notifications" element={<Notifications />} />
                    <Route path="admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
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
