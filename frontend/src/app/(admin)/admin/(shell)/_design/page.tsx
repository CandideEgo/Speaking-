"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  Download,
  Heart,
  Mail,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/common/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Image } from "@/components/ui/Image";
import { Container } from "@/components/ui/Container";
import { Stack } from "@/components/ui/Stack";
import { Grid } from "@/components/ui/Grid";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LinkButton } from "@/components/ui/LinkButton";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { PageHeader } from "@/components/ui/PageHeader";

/**
 * Component gallery — living reference for the unified component library
 * (ADR-0005). Admin-gated. Showcases every primitive with its variants so
 * Phase 4–5 page rewrites have a single visual anchor. Add new primitives
 * here as they land.
 */
export default function DesignSystemPage() {
  const [text, setText] = useState("");

  return (
    <Container className="py-8 space-y-10">
      <PageHeader
        title="组件库"
        description="统一组件库 — 以 watch 页为风格锚点（ADR-0005）。新增原语时在此登记。"
      />

      {/* === Button === */}
      <section>
        <SectionHeader title="Button" />
        <Card className="mt-4 space-y-5">
          <Stack direction="row" gap={3} className="flex-wrap">
            <Button variant="primary">Primary</Button>
            <Button variant="dark">Dark</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="text">Text</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </Stack>
          <Stack direction="row" gap={3} align="center" className="flex-wrap">
            <Button size="xs">xs</Button>
            <Button size="sm">sm</Button>
            <Button size="compact">compact</Button>
            <Button size="md">md</Button>
            <Button size="nav">nav</Button>
            <Button size="lg">lg</Button>
            <Button size="md" icon={Plus}>
              With icon
            </Button>
            <Button size="md" icon={ArrowRight} iconRight>
              Trailing
            </Button>
            <Button size="md" variant="primary" icon={Download} fullWidth>
              fullWidth
            </Button>
          </Stack>
        </Card>
      </section>

      {/* === Card === */}
      <section>
        <SectionHeader title="Card" />
        <Grid cols={3} gap={4} className="mt-4">
          <Card variant="outline" padding={5}>
            <Eyebrow>outline</Eyebrow>
            <p className="mt-2 text-sm text-body">
              bg-canvas + hairline border，hover 抬升。
            </p>
          </Card>
          <Card variant="soft" padding={5}>
            <Eyebrow>soft</Eyebrow>
            <p className="mt-2 text-sm text-body">
              bg-surface-soft + hairline border。
            </p>
          </Card>
          <Card variant="dark" padding={5}>
            <Eyebrow>dark</Eyebrow>
            <p className="mt-2 text-sm text-on-dark-soft">
              bg-surface-dark，反色文字。
            </p>
          </Card>
        </Grid>
      </section>

      {/* === Input / Textarea / Select === */}
      <section>
        <SectionHeader title="Input · Textarea · Select" />
        <Card className="mt-4 space-y-4">
          <Stack gap={2}>
            <label className="text-sm font-medium text-ink">昵称</label>
            <Input
              placeholder="输入昵称"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </Stack>
          <Stack gap={2}>
            <label className="text-sm font-medium text-ink">简介</label>
            <Textarea placeholder="一两句话介绍自己" rows={3} />
          </Stack>
          <Stack gap={2}>
            <label className="text-sm font-medium text-ink">目标考试</label>
            <Select defaultValue="cet4">
              <option value="cet4">CET-4</option>
              <option value="cet6">CET-6</option>
              <option value="gaokao">高考</option>
            </Select>
          </Stack>
        </Card>
      </section>

      {/* === Badge === */}
      <section>
        <SectionHeader title="Badge" />
        <Card className="mt-4">
          <Stack direction="row" gap={3} className="flex-wrap">
            <Badge tone="brand">brand</Badge>
            <Badge tone="amber">amber</Badge>
            <Badge tone="orange">orange</Badge>
            <Badge tone="green" icon={Check}>
              green
            </Badge>
            <Badge tone="red" icon={Trash2}>
              red
            </Badge>
            <Badge tone="neutral">neutral</Badge>
          </Stack>
        </Card>
      </section>

      {/* === Avatar === */}
      <section>
        <SectionHeader title="Avatar" />
        <Card className="mt-4">
          <p className="text-xs text-muted mb-4">
            size × src fallback（无 src / 加载失败 → 渐变首字母）
          </p>
          <Stack direction="row" gap={4} align="center" className="flex-wrap">
            <Avatar name="Alice" seed="u1" size="xs" />
            <Avatar name="Bob" seed="u2" size="sm" />
            <Avatar name="Charlie" seed="u3" size="md" />
            <Avatar name="Diana" seed="u4" size="lg" />
            <Avatar name="Evan" seed="u5" size="xl" />
            <div className="ml-6 flex items-center gap-3">
              <Avatar
                src="/media/avatars/sample.jpg"
                name="Fallback"
                seed="u6"
                size="lg"
              />
              <span className="text-xs text-muted">
                src 指向不存在的路径 → 自动回退
              </span>
            </div>
          </Stack>
        </Card>
      </section>

      {/* === Image === */}
      <section>
        <SectionHeader title="Image" />
        <Card className="mt-4">
          <p className="text-xs text-muted mb-4">
            next/image + mediaUrl；加载 pulse，失败/无 src 走 fallback
          </p>
          <Grid cols={2} gap={4}>
            <div>
              <p className="mb-2 text-xs text-muted">有 src（aspect-video）</p>
              <div className="relative aspect-video overflow-hidden rounded-lg">
                <Image
                  src="/media/thumbnails/sample.jpg"
                  alt="示例缩略图"
                  fill
                  fallback={
                    <div className="absolute inset-0 flex items-center justify-center bg-surface-card text-sm text-muted">
                      fallback placeholder
                    </div>
                  }
                />
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs text-muted">无 src（fallback）</p>
              <div className="relative aspect-video overflow-hidden rounded-lg">
                <Image
                  src={null}
                  alt="空"
                  fill
                  fallback={
                    <div className="absolute inset-0 flex items-center justify-center bg-surface-card text-sm text-muted">
                      no src → fallback
                    </div>
                  }
                />
              </div>
            </div>
          </Grid>
        </Card>
      </section>

      {/* === Layout primitives === */}
      <section>
        <SectionHeader title="Container · Stack · Grid" />
        <Card className="mt-4 space-y-4">
          <div>
            <p className="mb-2 text-xs text-muted">
              Stack direction=&quot;row&quot; gap=3 align=center
            </p>
            <Stack direction="row" gap={3} align="center">
              <Button size="sm" variant="outline" icon={Mail}>
                发消息
              </Button>
              <Button size="sm" variant="ghost" icon={Settings}>
                设置
              </Button>
              <Badge tone="green" icon={Check}>
                在线
              </Badge>
            </Stack>
          </div>
          <div>
            <p className="mb-2 text-xs text-muted">
              Grid cols=3（响应式：窄屏 1 列 → sm 2 列 → lg 3 列）
            </p>
            <Grid cols={1} gap={3} className="sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} variant="soft" padding={4}>
                  <span className="text-sm font-semibold">卡片 {i}</span>
                </Card>
              ))}
            </Grid>
          </div>
        </Card>
      </section>

      {/* === Misc primitives === */}
      <section>
        <SectionHeader title="其他原语" />
        <Card className="mt-4 space-y-6">
          <Stack gap={2}>
            <Eyebrow>Eyebrow 小标题</Eyebrow>
            <p className="text-sm text-body">用于区段上方的标签性小标题。</p>
          </Stack>
          <Stack direction="row" gap={3} className="flex-wrap">
            <LinkButton href="/admin" icon={ArrowRight}>
              LinkButton
            </LinkButton>
          </Stack>
          <Stack direction="row" gap={6} align="center" className="flex-wrap">
            <ProgressRing progress={0.72} size={64} label="72%" />
            <ProgressRing progress={0.45} size={64} label="45%" />
            <ProgressRing progress={1} size={64} label="完成" isMet />
          </Stack>
          <Stack direction="row" gap={3} className="flex-wrap">
            <Button variant="primary" icon={Heart}>
              主操作
            </Button>
            <Button variant="outline" icon={Plus}>
              次操作
            </Button>
            <Button variant="ghost" icon={Trash2}>
              删除
            </Button>
          </Stack>
        </Card>
      </section>
    </Container>
  );
}
