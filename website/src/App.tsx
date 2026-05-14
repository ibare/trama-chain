import { lazy, Suspense, useEffect, useRef } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import Nav from './layout/Nav.js';
import Footer from './layout/Footer.js';
import Home from './pages/Home.js';

const Concepts = lazy(() => import('./pages/Concepts.js'));
const Playground = lazy(() => import('./pages/Playground.js'));
const Examples = lazy(() => import('./pages/Examples.js'));
const Integration = lazy(() => import('./pages/Integration.js'));
const ApiReference = lazy(() => import('./pages/ApiReference.js'));
const Changelog = lazy(() => import('./pages/Changelog.js'));
const NotFound = lazy(() => import('./pages/NotFound.js'));

function ScrollToTop(): null {
  const { pathname } = useLocation();
  const prev = useRef('');
  useEffect(() => {
    if (pathname !== prev.current) {
      window.scrollTo(0, 0);
      prev.current = pathname;
    }
  }, [pathname]);
  return null;
}

export default function App(): JSX.Element {
  return (
    <div className="trama-site-shell">
      <ScrollToTop />
      <Nav />
      <main className="trama-site-main">
        <Suspense fallback={<div className="trama-site-loading">로딩 중…</div>}>
          <Routes>
            <Route index element={<Home />} />
            <Route path="concepts" element={<Concepts />} />
            <Route path="concepts/:section" element={<Concepts />} />
            <Route path="playground" element={<Playground />} />
            <Route path="examples" element={<Examples />} />
            <Route path="examples/:id" element={<Examples />} />
            <Route path="integration" element={<Integration />} />
            <Route path="integration/:section" element={<Integration />} />
            <Route path="api" element={<ApiReference />} />
            <Route path="api/:pkg" element={<ApiReference />} />
            <Route path="changelog" element={<Changelog />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
