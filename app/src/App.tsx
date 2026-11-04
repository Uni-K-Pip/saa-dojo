import { lazy, useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { StudyProvider, useStudy } from './state/study';
import { applyAppearance } from './appearance';

const HomePage = lazy(() => import('./pages/HomePage'));
const PracticeSetupPage = lazy(() => import('./pages/PracticeSetupPage'));
const PracticeSessionPage = lazy(() => import('./pages/PracticeSessionPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const MenuPage = lazy(() => import('./pages/MenuPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function Appearance() {
  const { settings } = useStudy();
  useEffect(() => {
    applyAppearance(settings.theme, settings.fontSize);
  }, [settings.theme, settings.fontSize]);
  return null;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="practice" element={<PracticeSetupPage />} />
        <Route path="session/:id" element={<PracticeSessionPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="menu" element={<MenuPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <StudyProvider>
      <Appearance />
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </StudyProvider>
  );
}
