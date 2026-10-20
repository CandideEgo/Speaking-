import { describe, expect, it } from "vitest";
import { publicErrorMessage } from "./publicError";

describe("用户可见错误", () => {
  it("保留可执行的业务提示", () => {
    expect(publicErrorMessage("手机号或密码错误", 401)).toBe("手机号或密码错误");
    expect(publicErrorMessage("视频解锁额度不足", 403)).toBe("视频解锁额度不足");
  });
  it.each([
    "数据库连接失败 redis://secret",
    "验证错误: [{input:secret}]",
    "Internal Server Error",
    "请查看 http://localhost:8000/api/v1",
    "",
  ])("隐藏内部诊断：%s", (text) => {
    expect(publicErrorMessage(text)).toBe("操作未完成，请稍后重试");
  });
  it("不向用户回显服务端和校验详情", () => {
    expect(publicErrorMessage("数据库密码错误", 500)).toBe("服务暂时不可用，请稍后重试");
    expect(publicErrorMessage("invalid input", 422)).toBe("填写的信息有误，请检查后重试");
    expect(publicErrorMessage("too many requests", 429)).toBe("操作较频繁，请稍后再试");
  });
});
