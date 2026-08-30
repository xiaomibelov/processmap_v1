import AdminPageContainer from "../layout/AdminPageContainer";
import SectionCard from "../components/common/SectionCard.jsx";
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
  } = payload;

  const snapshots = data?.snapshots || [];
  const current = data?.current || null;
  const analytics = data?.analytics || null;

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

      <GraphAnalyticsPanel
        analytics={analytics}
        title={t.analyticsTitle}
        subtitle={t.analyticsSubtitle}
      />
    </AdminPageContainer>
  );
}
