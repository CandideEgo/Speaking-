"use client";

import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { toastApiError } from "@/lib/errors";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { SectionCard } from "@/components/admin/SectionCard";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { cn } from "@/lib/utils";
import { getQualityReports, retranslateVideo, type QualityReport } from "@/lib/adminData";

/** Translation engines available for retranslate (后端支持). */
const ENGINES = [
  { key: "glm", label: "GLM" },
  { key: "qwen", label: "Qwen" },
  { key: "hy_mt2", label: "火山 MT2" },
  { key: "agnes", label: "Agnes" },
];

function stageLabel(stage: string): string {
  const map: Record<string, string> = {
    transcription: "转录",
    translation: "翻译",
    punctuation: "标点恢复",
    alignment: "对齐",
  };
  return map[stage] || stage;
}

function formatCoverage(ratio: number | null): string {
  if (ratio == null) return "-";
  return `${Math.round(ratio * 100)}%`;
}

function ReportRow({ r }: { r: QualityReport }) {
  const passed = r.passed;
  return (
    <div
      className={cn(
        "rounded-md border p-3.5",
        passed ? "border-success/30 bg-success-soft/50" : "border-error/30 bg-red-soft/50"
      )}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {passed ? (
          <CheckCircle2 size={15} className="text-success flex-shrink-0" />
        ) : (
          <XCircle size={15} className="text-error flex-shrink-0" />
        )}
        <span className="text-sm font-semibold text-ink">{stageLabel(r.stage)}</span>
        <span
          className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-pill",
            passed ? "bg-success/15 text-success" : "bg-error/15 text-error"
          )}
        >
          {passed ? "通过" : "未通过"}
        </span>
        {r.coverage_ratio != null && (
          <span className="text-xs text-muted ml-auto">
            覆盖率{" "}
            <span className="font-mono font-medium text-ink">
              {formatCoverage(r.coverage_ratio)}
            </span>
          </span>
        )}
        {r.segment_count != null && (
          <span className="text-xs text-muted">· {r.segment_count} 段</span>
        )}
        {r.created_at && (
          <span className="text-xs text-muted-soft">
            {new Date(r.created_at).toLocaleString("zh-CN")}
          </span>
        )}
      </div>

      {r.issues && r.issues.length > 0 && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-error">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          <div className="space-y-0.5">
            {r.issues.map((iss, i) => (
              <div key={i}>{iss}</div>
            ))}
          </div>
        </div>
      )}

      {r.metrics && Object.keys(r.metrics).length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-muted cursor-pointer hover:text-ink">详细指标</summary>
          <pre className="mt-1.5 text-[11px] text-muted bg-canvas rounded p-2 overflow-x-auto font-mono">
            {JSON.stringify(r.metrics, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

/**
 * Video-detail quality panel: shows each stage's pass/fail + coverage + issues
 * across re-runs, and lets the admin re-run translation with a different engine
 * (use after a quality block - same engine would reproduce low coverage).
 */
export function QualityReportPanel({ videoId }: { videoId: string }) {
  const [reports, setReports] = useState<QualityReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [retranslating, setRetranslating] = useState(false);
  const [confirmEngine, setConfirmEngine] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getQualityReports(videoId);
      setReports(data);
    } catch {
      // Silently fail - panel is supplementary
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  useEffect(() => {
    load();
  }, [load]);

  async function doRetranslate(engine: string) {
    setRetranslating(true);
    try {
      await retranslateVideo(videoId, engine);
      toast.success(`已用 ${engine} 重新翻译，质量标记已清除`);
      await load();
    } catch (err) {
      toastApiError(err, "重翻译失败");
    } finally {
      setRetranslating(false);
      setConfirmEngine(null);
    }
  }

  const blocked = reports.some((r) => !r.passed);

  return (
    <SectionCard
      title="质量报告"
      actions={
        <Button variant="outline" size="compact" onClick={load} disabled={loading} icon={RefreshCw}>
          刷新
        </Button>
      }
    >
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted py-4">
          <Loader2 size={14} className="animate-spin" /> 加载质量报告…
        </div>
      ) : reports.length === 0 ? (
        <p className="text-sm text-muted py-4">暂无质量报告。视频处理完成后会自动生成。</p>
      ) : (
        <div className="space-y-2.5">
          {reports.map((r) => (
            <ReportRow key={r.id} r={r} />
          ))}
        </div>
      )}

      {/* Retranslate with alternate engine */}
      <div className="mt-5 pt-4 border-t border-hairline">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-ink">换引擎重翻译：</span>
          {blocked && (
            <span className="text-xs text-warning flex items-center gap-1">
              <AlertTriangle size={12} />
              存在未通过的质量检查
            </span>
          )}
          <span className="text-xs text-muted ml-auto hidden sm:inline">
            同引擎同输入会复现低覆盖，建议换引擎重试
          </span>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {ENGINES.map((e) => (
            <Button
              key={e.key}
              variant="outline"
              size="compact"
              disabled={retranslating}
              onClick={() => setConfirmEngine(e.key)}
            >
              {retranslating && confirmEngine === e.key ? (
                <Loader2 size={12} className="animate-spin" />
              ) : null}
              {e.label}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-soft">
          重翻译会清空现有中文翻译与质量标记，用所选引擎重新生成。
        </p>
      </div>

      <ConfirmDialog
        open={!!confirmEngine}
        title="确认换引擎重翻译"
        message={`将清空现有中文翻译与质量标记，用 ${confirmEngine?.toUpperCase()} 重新生成。继续？`}
        tone="danger"
        confirmLabel="确认重翻译"
        onClose={() => setConfirmEngine(null)}
        onConfirm={() => confirmEngine && doRetranslate(confirmEngine)}
      />
    </SectionCard>
  );
}
