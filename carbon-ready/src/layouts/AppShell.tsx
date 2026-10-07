import { Outlet, useLocation } from 'react-router-dom';
import { Suspense, useEffect, useRef, useState } from 'react';
import { RouteSkeleton } from '../components/ui/RouteSkeleton';
import { Sidebar } from '../components/layout/Sidebar';
import { TopBar } from '../components/layout/TopBar';
import { Toaster, toast } from '../components/layout/Toast';
import { useStore } from '../store';
import { serverMode } from '../lib/server-api';

const REFRESH_MS = Number(import.meta.env.VITE_REFRESH_MS ?? 15_000);

export function AppShell() {
  const { pathname } = useLocation();
  useEffect(() => {
    const main = document.getElementById('content');
    if (main) main.scrollTop = 0;
  }, [pathname]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const refreshFromServer = useStore((s) => s.refreshFromServer);
  const hydrateFromServer = useStore((s) => s.hydrateFromServer);
  const serverLoaded = useStore((s) => s.server_loaded);

  // After a reload in server mode the store holds the last visit's copy.
  // Load everything from the server (as sign-in does) and show the route
  // skeleton until it lands, so stale data is never presented as current.
  // The ref keeps StrictMode's double effect from loading twice.
  const awaitingServer = serverMode() && isAuthenticated && !serverLoaded;
  const loadStarted = useRef(false);
  useEffect(() => {
    if (!awaitingServer || loadStarted.current) return;
    loadStarted.current = true;
    void hydrateFromServer().then(() => {
      const { isAuthenticated: stillSignedIn, hydration_errors } = useStore.getState();
      if (stillSignedIn && hydration_errors.length > 0) {
        toast.error('Some data could not be loaded', `Showing the copy saved in this browser for: ${hydration_errors.join(', ')}.`);
      }
    }).finally(() => { loadStarted.current = false; });
  }, [awaitingServer, hydrateFromServer]);

  // Real-time-ish sync: in server mode, re-pull the volatile slices every
  // REFRESH_MS while the tab is visible, plus immediately on refocus — other
  // users' submissions/approvals and background anchors appear without a
  // manual reload. In-flight guard keeps slow responses from stacking.
  useEffect(() => {
    if (!serverMode() || !isAuthenticated) return;
    let busy = false;
    const tick = () => {
      if (busy || document.hidden) return;
      busy = true;
      void refreshFromServer().finally(() => { busy = false; });
    };
    const interval = setInterval(tick, REFRESH_MS);
    const onFocus = () => tick();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [isAuthenticated, refreshFromServer]);
  return (
    <div className="flex h-full flex-col">
      <a href="#content" className="skip-link" onClick={() => document.getElementById('content')?.focus()}>Skip to content</a>
      <Toaster />
      <TopBar sidebarOpen={sidebarOpen} onOpenSidebar={() => setSidebarOpen((v) => !v)} />
      <div className="flex flex-1 min-h-0">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main id="content" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto bg-grid-faint [background-size:32px_32px] p-4 md:p-8 print:overflow-visible print:bg-none print:p-0">
          <div className="mx-auto grid max-w-[1440px] grid-cols-12 gap-6">
            <div className="col-span-12 min-w-0">
              <Suspense fallback={<RouteSkeleton path={pathname} />}>
                {awaitingServer ? <RouteSkeleton path={pathname} /> : <Outlet />}
              </Suspense>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
