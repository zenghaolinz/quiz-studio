import { Suspense, lazy, useEffect, useState } from "react";
import { AppShell, type PageKey } from "./components/AppShell";
import type { ImportDraft } from "./import-core/types/question-draft";
import type { QuestionBank } from "./domain/question";
import { clearImportDraft, loadImportDraft, saveImportDraft } from "./features/import/importDraftPersistence";
import type { ProviderConfig } from "./domain/ocr";
import { currentModelLabel } from "./features/ai/currentModel";
import { listProviders } from "./features/ocr/glmOcrApi";
import { isTauriRuntime } from "./lib/tauri";

const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const BanksPageModule = lazy(() => import("./pages/BanksPage").then((module) => ({ default: module.BanksPage })));
const BankDetailPageModule = lazy(() => import("./pages/BanksPage").then((module) => ({ default: module.BankDetailPage })));
const PracticePage = lazy(() => import("./pages/PracticePage").then((module) => ({ default: module.PracticePage })));
const TestPage = lazy(() => import("./pages/TestPage").then((module) => ({ default: module.TestPage })));
const OcrPage = lazy(() => import("./pages/OcrPage").then((module) => ({ default: module.OcrPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const ImportSelectPage = lazy(() => import("./features/import/pages/ImportSelectPage").then((module) => ({ default: module.ImportSelectPage })));
const ImportReviewPage = lazy(() => import("./features/import/pages/ImportReviewPage").then((module) => ({ default: module.ImportReviewPage })));

function PageLoading() {
  return <div className="loading-card">正在加载页面…</div>;
}

export default function App() {
  const [page, setPage] = useState<PageKey>("dashboard");
  const [selectedBank, setSelectedBank] = useState<QuestionBank | null>(null);
  const [importDraft, setImportDraft] = useState<ImportDraft | null>(() => loadImportDraft());
  const [providers, setProviders] = useState<ProviderConfig[]>([]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    void listProviders().then(setProviders).catch(() => setProviders([]));
  }, []);

  function openBank(bank: QuestionBank) {
    setSelectedBank(bank);
    setPage("bank-detail");
  }

  function startPractice() {
    setPage("practice");
  }

  function startTest() {
    setPage("test");
  }

  return (
    <AppShell page={page} onPageChange={setPage} currentModel={currentModelLabel(providers)}>
      <Suspense fallback={<PageLoading />}>
        {page === "dashboard" ? (
          <DashboardPage onImport={() => setPage("import")} onCreateBank={() => setPage("banks")} />
        ) : null}
        {page === "banks" ? <BanksPageModule onOpenBank={openBank} /> : null}
        {page === "bank-detail" && selectedBank ? (
          <BankDetailPageModule
            bank={selectedBank}
            onBack={() => setPage("banks")}
            onPractice={startPractice}
            onTest={startTest}
            onOpenSettings={() => setPage("settings")}
          />
        ) : null}
        {page === "practice" ? <PracticePage bankId={selectedBank?.id ?? null} bankName={selectedBank?.name} /> : null}
        {page === "test" ? (
          <TestPage
            bankId={selectedBank?.id ?? null}
            bankName={selectedBank?.name}
            onSelectBank={() => setPage("banks")}
          />
        ) : null}
        {page === "ocr" ? <OcrPage onReview={(draft) => { setImportDraft(draft); setPage("import"); }} /> : null}
        {page === "import" && !importDraft ? (
          <ImportSelectPage onLoaded={(draft) => { saveImportDraft(draft); setImportDraft(draft); }} />
        ) : null}
        {page === "import" && importDraft ? (
          <ImportReviewPage
            draft={importDraft}
            onCancel={() => { clearImportDraft(); setImportDraft(null); }}
            onImported={(bankId) => {
              // 导入成功：清除草稿，跳到题库列表（用户可打开刚导入的库）
              setImportDraft(null);
              clearImportDraft();
              setSelectedBank(null);
              setPage("banks");
              void bankId;
            }}
          />
        ) : null}
        {page === "settings" ? <SettingsPage onProvidersChanged={setProviders} /> : null}
      </Suspense>
    </AppShell>
  );
}
