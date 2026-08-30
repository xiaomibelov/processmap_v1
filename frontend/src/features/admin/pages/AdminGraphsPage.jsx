import { useRef, useState } from "react";
import AdminPageContainer from "../layout/AdminPageContainer";
import SectionCard from "../components/common/SectionCard.jsx";
import EmptyState from "../components/common/EmptyState.jsx";
import GraphViewerPanel from "../components/graphs/GraphViewerPanel.jsx";
import GraphAnalyticsPanel from "../components/graphs/GraphAnalyticsPanel.jsx";
import GraphSnapshotsPanel from "../components/graphs/GraphSnapshotsPanel.jsx";
import GraphRebuildStatus from "../components/graphs/GraphRebuildStatus.jsx";
import { ru } from "../../../shared/i18n/ru";

const t = ru.admin.graphsPage;

export default function AdminGraphsPage({ payload = {} }) {
  const {
    data,
    loading,
    error,
    rebuilding,
    rebuildError,
    activeJobId,
    activeStatus,
    rebuild,
    uploading,
    uploadError,
    uploadSuccess,
    uploadSnapshot,
  } = payload;

  const [graphFile, setGraphFile] = useState(null);
  const [analysisFile, setAnalysisFile] = useState(null);
  const graphInputRef = useRef(null);
  const analysisInputRef = useRef(null);

  const snapshots = data?.snapshots || [];
  const current = data?.current || null;
  const analytics = data?.analytics || null;
  const hasSnapshot = Boolean(current);

  const canUpload = Boolean(graphFile && analysisFile && !uploading);

  const handleUpload = async () => {
    if (!canUpload) return;
    const formData = new FormData();
    formData.append("graph_json", graphFile);
    formData.append("analysis_json", analysisFile);
    const r = await uploadSnapshot(formData);
    if (r?.ok) {
      setGraphFile(null);
      setAnalysisFile(null);
      if (graphInputRef.current) graphInputRef.current.value = "";
      if (analysisInputRef.current) analysisInputRef.current.value = "";
    }
  };

  if (loading) {
    return (
      <AdminPageContainer>
        <div className="text-sm text-slate-400 py-8 text-center">{t.loading}</div>
      </AdminPageContainer>
    );
  }

  if (error) {
    return (
      <AdminPageContainer>
        <div className="text-sm text-rose-600 py-8 text-center">{error}</div>
      </AdminPageContainer>
    );
  }

  return (
    <AdminPageContainer>
      <SectionCard
        eyebrow={t.controlEyebrow}
        title={t.controlTitle}
        subtitle={t.controlSubtitle}
        action={(
          <div className="flex items-center gap-3">
            {rebuilding ? (
              <span className="text-xs text-amber-600 font-medium">{t.rebuilding}</span>
            ) : null}
            <button
              type="button"
              onClick={rebuild}
              disabled={rebuilding}
              className="rounded-xl border border-slate-200 bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
            >
              {rebuilding ? t.rebuildBusy : t.rebuildBtn}
            </button>
          </div>
        )}
      >
        {activeJobId ? (
          <GraphRebuildStatus
            jobId={activeJobId}
            status={activeStatus?.status}
            log={activeStatus?.log || []}
            error={rebuildError}
          />
        ) : (
          <div className="text-xs text-slate-500">{t.noRebuildHint}</div>
        )}
      </SectionCard>

      <SectionCard
        eyebrow={t.uploadEyebrow}
        title={t.uploadTitle}
        subtitle={t.uploadSubtitle}
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-700">{t.uploadGraphLabel}</span>
              <input
                type="file"
                accept=".json,application/json"
                ref={graphInputRef}
                onChange={(e) => setGraphFile(e.target.files?.[0] || null)}
                className="mt-1 block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:font-medium file:text-slate-700 hover:file:bg-slate-200"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-700">{t.uploadAnalysisLabel}</span>
              <input
                type="file"
                accept=".json,application/json"
                ref={analysisInputRef}
                onChange={(e) => setAnalysisFile(e.target.files?.[0] || null)}
                className="mt-1 block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:font-medium file:text-slate-700 hover:file:bg-slate-200"
              />
            </label>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={handleUpload}
              disabled={!canUpload}
              className="rounded-xl border border-slate-200 bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
            >
              {uploading ? t.uploadBusy : t.uploadBtn}
            </button>
            {uploadSuccess ? <span className="text-xs text-emerald-600 font-medium">{t.uploadSuccess}</span> : null}
            {uploadError ? <span className="text-xs text-rose-600 font-medium">{uploadError}</span> : null}
          </div>
          <p className="text-xs text-slate-500">{t.uploadHint}</p>
        </div>
      </SectionCard>

      {!hasSnapshot && !rebuilding ? (
        <SectionCard title={t.viewerTitle} subtitle={t.viewerSubtitle}>
          <div className="py-8">
            <EmptyState title={t.emptyStateTitle} description={t.emptyStateDescription} />
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={rebuild}
                className="rounded-xl border border-slate-200 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                {t.rebuildBtn}
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-slate-500">{t.rebuildDurationHint}</p>
          </div>
        </SectionCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <GraphViewerPanel
              currentSnapshot={current}
              title={t.viewerTitle}
              subtitle={t.viewerSubtitle}
            />
          </div>
          <div>
            <GraphSnapshotsPanel
              snapshots={snapshots}
              title={t.snapshotsTitle}
              subtitle={t.snapshotsSubtitle}
            />
          </div>
        </div>
      )}

      <GraphAnalyticsPanel
        analytics={analytics}
        title={t.analyticsTitle}
        subtitle={t.analyticsSubtitle}
      />
    </AdminPageContainer>
  );
}
