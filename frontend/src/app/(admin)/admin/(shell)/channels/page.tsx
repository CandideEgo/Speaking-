"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Pencil, Plus, Radio, Trash2 } from "lucide-react";
import {
  createChannel,
  deleteChannel,
  listChannelsAdmin,
  updateChannel,
  type ChannelUpsertPayload,
} from "@/lib/adminData";
import { toastApiError } from "@/lib/errors";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FormField } from "@/components/ui/FormField";
import { Modal } from "@/components/common/Modal";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import type { AdminChannel } from "@/types";

interface FormState {
  name: string;
  slug: string;
  description: string;
  cover_url: string;
  upstream_channel_id: string;
  sort_order: number;
  is_visible: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  slug: "",
  description: "",
  cover_url: "",
  upstream_channel_id: "",
  sort_order: 0,
  is_visible: true,
};

export default function AdminChannelsPage() {
  const [channels, setChannels] = useState<AdminChannel[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Create/edit modal state (null = closed; channel = editing).
  const [editing, setEditing] = useState<AdminChannel | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<AdminChannel | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await listChannelsAdmin();
      setChannels(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditing("new");
  }

  function openEdit(ch: AdminChannel) {
    setForm({
      name: ch.name,
      slug: ch.slug,
      description: ch.description ?? "",
      cover_url: ch.cover_url ?? "",
      upstream_channel_id: ch.upstream_channel_id ?? "",
      sort_order: ch.sort_order,
      is_visible: ch.is_visible,
    });
    setEditing(ch);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("请填写频道名称");
      return;
    }
    setSaving(true);
    const payload: ChannelUpsertPayload = {
      name: form.name.trim(),
      slug: form.slug.trim() || undefined,
      description: form.description.trim() || null,
      cover_url: form.cover_url.trim() || null,
      upstream_channel_id: form.upstream_channel_id.trim() || null,
      sort_order: form.sort_order,
      is_visible: form.is_visible,
    };
    try {
      if (editing === "new") {
        await createChannel(payload);
        toast.success("频道已创建");
      } else if (editing) {
        await updateChannel(editing.id, payload);
        toast.success("频道已更新");
      }
      setEditing(null);
      await load();
    } catch (e) {
      toastApiError(e, "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function toggleVisible(ch: AdminChannel) {
    try {
      await updateChannel(ch.id, { is_visible: !ch.is_visible });
      await load();
    } catch (e) {
      toastApiError(e, "操作失败");
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    try {
      await deleteChannel(deleting.id);
      toast.success("频道已删除（其视频保留，归属清空）");
      setDeleting(null);
      await load();
    } catch (e) {
      toastApiError(e, "删除失败");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-ink flex items-center gap-2">
            <Radio size={18} className="text-brand-500" />
            频道管理
          </h1>
          <p className="text-[13px] text-muted mt-0.5">
            官方策展频道（ADR-0014）。登记上游频道 ID 后，新入库视频将自动挂接。
          </p>
        </div>
        <Button onClick={openCreate} icon={Plus} size="sm">
          新建频道
        </Button>
      </div>

      {error && <div className="text-sm text-error">{error}</div>}

      {channels === null && !error && (
        <div className="flex items-center gap-2 text-sm text-muted py-8 justify-center">
          <Loader2 size={14} className="animate-spin" /> 加载中…
        </div>
      )}

      {channels !== null && channels.length === 0 && (
        <div className="text-sm text-muted py-8 text-center">
          还没有频道，点右上角「新建频道」创建第一个。
        </div>
      )}

      {channels !== null && channels.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-muted uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">频道</th>
                <th className="px-4 py-3 font-medium">slug</th>
                <th className="px-4 py-3 font-medium">上游 ID</th>
                <th className="px-4 py-3 font-medium text-center">排序</th>
                <th className="px-4 py-3 font-medium text-center">视频数</th>
                <th className="px-4 py-3 font-medium text-center">状态</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((ch) => (
                <tr key={ch.id} className="border-b border-hairline-soft last:border-b-0">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{ch.name}</p>
                    {ch.description && (
                      <p className="text-xs text-muted mt-0.5 line-clamp-1">{ch.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{ch.slug}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    {ch.upstream_channel_id || "—"}
                  </td>
                  <td className="px-4 py-3 text-center text-muted">{ch.sort_order}</td>
                  <td className="px-4 py-3 text-center text-muted">{ch.video_count}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleVisible(ch)}
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors ${
                        ch.is_visible
                          ? "text-success bg-success-soft"
                          : "text-muted bg-surface-card"
                      }`}
                      title={ch.is_visible ? "点击隐藏" : "点击显示"}
                    >
                      {ch.is_visible ? <Eye size={12} /> : <EyeOff size={12} />}
                      {ch.is_visible ? "可见" : "隐藏"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="compact"
                        icon={Pencil}
                        onClick={() => openEdit(ch)}
                      >
                        编辑
                      </Button>
                      <Button
                        variant="outline"
                        size="compact"
                        icon={Trash2}
                        className="text-error border-error/40 hover:bg-red-soft"
                        onClick={() => setDeleting(ch)}
                      >
                        删除
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Create / edit modal */}
      <Modal
        open={editing !== null}
        onClose={() => !saving && setEditing(null)}
        title={editing === "new" ? "新建频道" : "编辑频道"}
        maxWidth="max-w-lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="频道名称 *">
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="如：TED Talks"
              maxLength={255}
            />
          </FormField>
          <FormField label="slug（URL 标识）" hint="留空则按名称自动生成；小写字母、数字、连字符">
            <Input
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              placeholder="ted-talks"
              maxLength={120}
            />
          </FormField>
          <FormField label="简介">
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              placeholder="频道一句话介绍"
            />
          </FormField>
          <FormField label="封面图地址" hint="建议上传到媒体卷后填本地路径，避免外部依赖">
            <Input
              value={form.cover_url}
              onChange={(e) => setForm((f) => ({ ...f, cover_url: e.target.value }))}
              placeholder="/media/channels/ted.jpg"
            />
          </FormField>
          <FormField label="上游频道 ID" hint="YouTube/Bilibili 频道 ID；登记后匹配的视频自动挂接">
            <Input
              value={form.upstream_channel_id}
              onChange={(e) => setForm((f) => ({ ...f, upstream_channel_id: e.target.value }))}
              placeholder="UCxxxxxxxx"
              maxLength={64}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="排序（小在前）">
              <Select
                value={String(form.sort_order)}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
              >
                {Array.from({ length: 21 }).map((_, i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="是否可见">
              <Select
                value={form.is_visible ? "1" : "0"}
                onChange={(e) => setForm((f) => ({ ...f, is_visible: e.target.value === "1" }))}
              >
                <option value="1">可见</option>
                <option value="0">隐藏</option>
              </Select>
            </FormField>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleting !== null}
        tone="danger"
        title={`删除频道「${deleting?.name}」？`}
        message="频道本身被删除；已归属的视频保留，但频道归属会清空。此操作不可撤销。"
        confirmLabel="删除"
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
