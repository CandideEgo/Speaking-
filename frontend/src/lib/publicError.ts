/** Keep service diagnostics out of user-facing messages. */
export function publicErrorMessage(message: string, status = 0): string {
  if (status >= 500) return "服务暂时不可用，请稍后重试";
  if (status === 429) return "操作较频繁，请稍后再试";
  if (status === 422) return "填写的信息有误，请检查后重试";
  const text = message.trim();
  if (
    !text ||
    text.length > 160 ||
    !/[\u3400-\u9fff]/.test(text) ||
    /https?:|localhost|127\.0\.0\.1|traceback|exception|sqlalchemy|postgres|redis|token|secret|api.key|\/api\/|\bat\s+\S+\(|[{}[\]<>]/i.test(
      text
    )
  )
    return "操作未完成，请稍后重试";
  return text;
}
