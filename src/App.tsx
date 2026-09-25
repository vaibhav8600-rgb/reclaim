import { lazy, Suspense, useEffect, type ComponentType } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { Toaster } from './components/Toaster'
import { ScrollToTop } from './lib/ScrollToTop'
// The main tabs load with the app, so switching between them is instant.
import { TodayPage } from './features/today/TodayPage'
import { TimelinePage } from './features/timeline/TimelinePage'
import { InjuriesPage } from './features/injuries/InjuriesPage'
import { InjuryDetailPage } from './features/injuries/InjuryDetailPage'
import { RehabPage } from './features/rehab/RehabPage'

/** Everything else is split out and fetched on idle after start-up (and precached for offline use). */
const pages: (() => Promise<unknown>)[] = []
function page<T extends ComponentType>(load: () => Promise<{ [k: string]: unknown }>, name: string) {
  const loader = () => load().then((m) => ({ default: m[name] as T }))
  pages.push(loader)
  return lazy(loader)
}

const InjuryFormPage = page(() => import('./features/injuries/InjuryFormPage'), 'InjuryFormPage')
const SymptomLogPage = page(() => import('./features/log/SymptomLogPage'), 'SymptomLogPage')
const MeasurementLogPage = page(() => import('./features/log/MeasurementLogPage'), 'MeasurementLogPage')
const NoteLogPage = page(() => import('./features/log/NoteLogPage'), 'NoteLogPage')
const NoteReviewPage = page(() => import('./features/log/NoteReviewPage'), 'NoteReviewPage')
const SettingsPage = page(() => import('./features/settings/SettingsPage'), 'SettingsPage')
const DriveConnectPage = page(() => import('./features/settings/DriveConnectPage'), 'DriveConnectPage')
const LibraryPage = page(() => import('./features/rehab/LibraryPage'), 'LibraryPage')
const ExerciseDetailPage = page(() => import('./features/rehab/ExerciseDetailPage'), 'ExerciseDetailPage')
const ExerciseFormPage = page(() => import('./features/rehab/ExerciseFormPage'), 'ExerciseFormPage')
const PrescriptionFormPage = page(() => import('./features/rehab/PrescriptionFormPage'), 'PrescriptionFormPage')
const SessionPage = page(() => import('./features/rehab/SessionPage'), 'SessionPage')
const DocumentsPage = page(() => import('./features/documents/DocumentsPage'), 'DocumentsPage')
const DocumentDetailPage = page(() => import('./features/documents/DocumentDetailPage'), 'DocumentDetailPage')
const DocumentFormPage = page(() => import('./features/documents/DocumentFormPage'), 'DocumentFormPage')
const InsightsPage = page(() => import('./features/insights/InsightsPage'), 'InsightsPage')
const ReportPage = page(() => import('./features/report/ReportPage'), 'ReportPage')
const NutritionPage = page(() => import('./features/nutrition/NutritionPage'), 'NutritionPage')
const MealLogPage = page(() => import('./features/nutrition/MealLogPage'), 'MealLogPage')
const HealthSetupPage = page(() => import('./features/settings/HealthSetupPage'), 'HealthSetupPage')
const FoodPage = page(() => import('./features/nutrition/FoodPage'), 'FoodPage')
const GoalsPage = page(() => import('./features/goals/GoalsPage'), 'GoalsPage')
const WeightPage = page(() => import('./features/goals/WeightPage'), 'WeightPage')
const WelcomePage = page(() => import('./features/goals/WelcomePage'), 'WelcomePage')
const SleepLogPage = page(() => import('./features/log/SleepLogPage'), 'SleepLogPage')
const StepsLogPage = page(() => import('./features/log/StepsLogPage'), 'StepsLogPage')
const HealthPage = page(() => import('./features/health/HealthPage'), 'HealthPage')
const SafetyCheckPage = page(() => import('./features/health/SafetyCheckPage'), 'SafetyCheckPage')
const LabPage = page(() => import('./features/health/LabPage'), 'LabPage')
const ReviewPage = page(() => import('./features/health/ReviewPage'), 'ReviewPage')
const FactFormPage = page(() => import('./features/health/FactFormPage'), 'FactFormPage')
const ImportPage = page(() => import('./features/health/ImportPage'), 'ImportPage')
const PlanPage = page(() => import('./features/plan/PlanPage'), 'PlanPage')
const SummariesPage = page(() => import('./features/health/SummariesPage'), 'SummariesPage')

function Preload() {
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 1500))
    idle(() => pages.forEach((load) => void load()))
  }, [])
  return null
}

export function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Preload />
      <Suspense fallback={null}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<TodayPage />} />
            <Route path="rehab" element={<RehabPage />} />
            <Route path="rehab/library" element={<LibraryPage />} />
            <Route path="rehab/exercises/:id" element={<ExerciseDetailPage />} />
            <Route path="timeline" element={<TimelinePage />} />
            <Route path="injuries" element={<InjuriesPage />} />
            <Route path="injuries/:id" element={<InjuryDetailPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="documents/:id" element={<DocumentDetailPage />} />
            <Route path="insights" element={<InsightsPage />} />
            <Route path="report" element={<ReportPage />} />
            <Route path="nutrition" element={<NutritionPage />} />
            <Route path="health" element={<HealthPage />} />
            <Route path="safety" element={<SafetyCheckPage />} />
            <Route path="plan" element={<PlanPage />} />
            <Route path="goals" element={<GoalsPage />} />
            <Route path="nutrition/foods/:id" element={<FoodPage />} />
            <Route path="settings/health" element={<HealthSetupPage />} />
            <Route path="weight" element={<WeightPage />} />
            <Route path="health/lab" element={<LabPage />} />
            <Route path="health/summaries" element={<SummariesPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<TodayPage />} />
          </Route>
          {/* Sheet-style screens: no tab bar (see MLink's SHEET pattern) */}
          <Route path="injuries/new" element={<InjuryFormPage />} />
          <Route path="injuries/:id/edit" element={<InjuryFormPage />} />
          <Route path="log/symptom" element={<SymptomLogPage />} />
          <Route path="log/measurement" element={<MeasurementLogPage />} />
          <Route path="log/note" element={<NoteLogPage />} />
          <Route path="log/review" element={<NoteReviewPage />} />
          <Route path="log/meal" element={<MealLogPage />} />
          <Route path="log/sleep" element={<SleepLogPage />} />
          <Route path="welcome" element={<WelcomePage />} />
          <Route path="log/steps" element={<StepsLogPage />} />
          <Route path="rehab/session" element={<SessionPage />} />
          <Route path="rehab/plan/new" element={<PrescriptionFormPage />} />
          <Route path="rehab/plan/:id/edit" element={<PrescriptionFormPage />} />
          <Route path="rehab/exercises/new" element={<ExerciseFormPage />} />
          <Route path="rehab/exercises/:id/edit" element={<ExerciseFormPage />} />
          <Route path="documents/new" element={<DocumentFormPage />} />
          <Route path="documents/:id/edit" element={<DocumentFormPage />} />
          <Route path="documents/import" element={<ImportPage />} />
          <Route path="health/review" element={<ReviewPage />} />
          <Route path="health/review/:id" element={<ReviewPage />} />
          <Route path="health/facts/new" element={<FactFormPage />} />
          <Route path="health/facts/:id" element={<FactFormPage />} />
          <Route path="settings/drive" element={<DriveConnectPage />} />
        </Routes>
      </Suspense>
      <Toaster />
    </BrowserRouter>
  )
}
