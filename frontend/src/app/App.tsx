import { BrowserRouter, Route, Routes } from 'react-router';
import { RootLayout } from './RootLayout';
import HomePage from '../pages/HomePage';
import PlanPage from '../pages/PlanPage';
import RoutesPage from '../pages/RoutesPage';
import StopsPage from '../pages/StopsPage';
import CardPage from '../pages/CardPage';
import NotFoundPage from '../pages/NotFoundPage';
import { paths } from './routes';

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
 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<RootLayout />}>
          <Route path={paths.home} element={<HomePage />} />
          <Route path={paths.plan} element={<PlanPage />} />
          {/* Detail routes arrive with their stages; the index answers both
              for now so a deep link lands somewhere real rather than on 404. */}
          <Route path={paths.routes} element={<RoutesPage />} />
          <Route path={paths.routeDetail} element={<RoutesPage />} />
          <Route path={paths.stops} element={<StopsPage />} />
          <Route path={paths.stopDetail} element={<StopsPage />} />
          <Route path={paths.card} element={<CardPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
