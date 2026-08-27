import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { RootLayout } from './RootLayout';
import CardPage from '../pages/CardPage';
import FavouritesPage from '../pages/FavouritesPage';
import NotFoundPage from '../pages/NotFoundPage';
import { paths } from './routes';

/*
 * The three pages that carry a map, loaded when one is opened rather than up
 * front.
 *
 * The map engine is by far the largest thing this app ships — several times
 * the size of everything else put together — and two of the five pages have no
 * map on them at all. Bundled as one chunk, somebody checking a card balance
 * downloaded and parsed a rendering engine they would never see.
 *
 * Split on the route rather than on the component, because the page is the
 * unit somebody actually navigates to; splitting lower would mean a page that
 * arrives and then visibly waits for its own main content.
 *
 * The other pages stay eagerly imported. They are small, and a card page that
 * flashed a fallback on the way in would be a worse trade than the handful of
 * kilobytes it saves.
 */
const PlanPage = lazy(() => import('../pages/PlanPage'));
const RoutesPage = lazy(() => import('../pages/RoutesPage'));
const StopsPage = lazy(() => import('../pages/StopsPage'));

/**
 * The route table.
 *
 * Declarative mode rather than data mode: loaders would introduce a second
 * data-fetching paradigm alongside the effect-based one already in use, and
 * every component test would need `createMemoryRouter` instead of a plain
 * `render()` inside `<MemoryRouter>`.
 *
 * `BrowserRouter` means the production host must serve index.html for unknown
 * paths. That is a deploy note, not a reason to put a `#` in every URL.
 *
 * The `Suspense` boundary is inside the layout rather than around it, so the
 * header and navigation are painted while a map page's chunk is on its way —
 * a whole-app fallback would blank the chrome somebody just pressed.
 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<RootLayout />}>
          {/* The planner is the root: it is what nearly everyone comes for.
              `/plan` redirects rather than 404ing, so an existing link still
              lands somewhere sensible. */}
          <Route path={paths.home} element={<PlanPage />} />
          <Route path={paths.plan} element={<Navigate to={paths.home} replace />} />
          {/* Detail routes arrive with their stages; the index answers both
              for now so a deep link lands somewhere real rather than on 404. */}
          <Route path={paths.routes} element={<RoutesPage />} />
          <Route path={paths.routeDetail} element={<RoutesPage />} />
          <Route path={paths.stops} element={<StopsPage />} />
          <Route path={paths.stopDetail} element={<StopsPage />} />
          <Route path={paths.card} element={<CardPage />} />
          <Route path={paths.favourites} element={<FavouritesPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
