import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { Spinner } from "./components/ui/misc";
import { useAuth } from "./lib/auth";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import LandingPage from "./pages/LandingPage";

// The signed-in pages (audio player, editors, charts) load on demand, so visitors to the
// landing page download only what it needs.
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const MeetingPage = lazy(() => import("./pages/MeetingPage"));
const RecordPage = lazy(() => import("./pages/RecordPage"));
const UploadPage = lazy(() => import("./pages/UploadPage"));
const SeriesPage = lazy(() => import("./pages/SeriesPage"));
// Development only: Vite replaces import.meta.env.DEV with false in builds, so this is dropped.
const BuddyGallery = import.meta.env.DEV ? lazy(() => import("./pages/BuddyGallery")) : () => null;

function PageLoading() {
  return (
    <p className="flex items-center gap-2 text-muted-foreground">
      <Spinner /> Loading…
    </p>
  );
}

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      <Spinner className="mr-2" /> Loading…
    </div>
  );
}

/** "/" is the landing page for visitors and the meetings dashboard once logged in. */
function Home() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <LandingPage />;
  return (
    <AppLayout>
      <Suspense fallback={<PageLoading />}>
        <DashboardPage />
      </Suspense>
    </AppLayout>
  );
}

function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return (
    <AppLayout>
      <Suspense fallback={<PageLoading />}>
        <Outlet />
      </Suspense>
    </AppLayout>
  );
}

function GuestOnly() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/welcome" element={<LandingPage />} />
      {import.meta.env.DEV && (
        <Route
          path="/__buddy"
          element={
            <Suspense fallback={<Loading />}>
              <BuddyGallery />
            </Suspense>
          }
        />
      )}
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/record" element={<RecordPage />} />
        <Route path="/meetings/:id" element={<MeetingPage />} />
        <Route path="/series/:id" element={<SeriesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
