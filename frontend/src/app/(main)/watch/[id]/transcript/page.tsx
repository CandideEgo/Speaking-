import { TranscriptDocument } from "@/components/transcript/TranscriptDocument";

/**
 * 全文文稿页：`/watch/{id}/transcript`。
 *
 * 页面本身不取数，也不自写一级标题——标题与文档头都在客户端组件里（依赖
 * `useParams` 读视频 id），这样同一条路由既能被首页 hero 链接，也能被以后从
 * 播放页加进来的「看全文」入口复用。
 */
export default function TranscriptPage() {
  return <TranscriptDocument />;
}
