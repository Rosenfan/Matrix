import assert from "node:assert/strict";
import test from "node:test";
import { text } from "../src/messages.js";

test("Chinese installer prompts, confirmations, states, and actions are localized", () => {
  assert.equal(text("zh-CN", "scopeQuestion"), "安装范围");
  assert.equal(text("zh-CN", "platformsQuestion"), "要配置的平台");
  assert.equal(text("zh-CN", "mattQuestion"), "是否在当前项目安装或核对 Matrix 支持的 Matt Pocock Release？");
  assert.equal(text("zh-CN", "replaceQuestion"), "现有 Matrix 文件无法确认由 Matrix 管理。是否备份并替换？");
  assert.match(text("zh-CN", "mattReplaceQuestion"), /本地修改或不可读内容/);
  assert.equal(text("zh-CN", "stateSafeUpdate"), "可安全更新");
  assert.equal(text("zh-CN", "stateAdoptable"), "可接管");
  assert.equal(text("zh-CN", "stateUnreadable"), "不可读");
  assert.equal(text("zh-CN", "stateCompatible"), "兼容");
  assert.equal(text("zh-CN", "yes"), "是");
  assert.equal(text("zh-CN", "actionBackupReplace"), "备份并替换");
});

test("update collaboration prompts exist in both languages", () => {
  for (const language of ["en", "zh-CN"]) {
    assert.match(text(language, "mattRepairQuestion"), /\{state\}/);
    assert.match(text(language, "mattRepairQuestion"), /\{release\}/);
    assert.match(text(language, "readyHint"), /\$matrix/);
    assert.ok(text(language, "updateScopeQuestion").length > 0);
    assert.ok(text(language, "updateScopeCurrent").length > 0);
    assert.ok(text(language, "updateScopeAll").length > 0);
    assert.ok(text(language, "orchestrationArchDetail").includes("Matt"));
    assert.ok(text(language, "orchestrationPrimDetail").length > 0);
  }
  assert.match(text("zh-CN", "orchestrationPrimDetail"), /不依赖/);
});
