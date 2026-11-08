import { lazy, useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { StudyProvider, useStudy } from './state/study';
import { applyAppearance } from './appearance';

const HomePage = lazy(() => import('./pages/HomePage'));
const PracticeSetupPage = lazy(() => import('./pages/PracticeSetupPage'));
const PracticeSessionPage = lazy(() => import('./pages/PracticeSessionPage'));
const MockPage = lazy(() => import('./pages/MockPage'));
const MockSessionPage = lazy(() => import('./pages/MockSessionPage'));
const MockResultPage = lazy(() => import('./pages/MockResultPage'));
const BasicsPage = lazy(() => import('./pages/BasicsPage'));
const RoadmapPage = lazy(() => import('./pages/RoadmapPage'));
const LessonPage = lazy(() => import('./pages/LessonPage'));
const ReviewPage = lazy(() => import('./pages/ReviewPage'));
const FlashcardsPage = lazy(() => import('./pages/FlashcardsPage'));
const ReadinessPage = lazy(() => import('./pages/ReadinessPage'));
const GlossaryPage = lazy(() => import('./pages/GlossaryPage'));
const DocsPage = lazy(() => import('./pages/DocsPage'));
const DocPage = lazy(() => import('./pages/DocsPage').then((m) => ({ default: m.DocPage })));
const AnalysisPage = lazy(() => import('./pages/AnalysisPage'));
const DrillPage = lazy(() => import('./pages/DrillPage'));
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

// ブラウザがデータを勝手に消さないよう、永続化を求める（結果は設定画面で表示する）
function PersistStorage() {
  useEffect(() => {
    void navigator.storage?.persist?.().catch(() => false);
  }, []);
  return null;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="practice" element={<PracticeSetupPage />} />
        <Route path="session/:id" element={<PracticeSessionPage />} />
        <Route path="mock" element={<MockPage />} />
        <Route path="mock/session/:id" element={<MockSessionPage />} />
        <Route path="mock/result/:id" element={<MockResultPage />} />
        <Route path="basics" element={<BasicsPage />} />
        <Route path="roadmap" element={<RoadmapPage />} />
        <Route path="lessons/:id" element={<LessonPage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="flashcards" element={<FlashcardsPage />} />
        <Route path="readiness" element={<ReadinessPage />} />
        <Route path="glossary" element={<GlossaryPage />} />
        <Route path="docs" element={<DocsPage />} />
        <Route path="docs/:id" element={<DocPage />} />
        <Route path="analysis" element={<AnalysisPage />} />
        <Route path="drill" element={<DrillPage />} />
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
      <PersistStorage />
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </StudyProvider>
  );
}
