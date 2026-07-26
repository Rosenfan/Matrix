import assert from "node:assert/strict";
import test from "node:test";
import { text } from "../src/messages.js";

test("Chinese installer prompts, confirmations, states, and actions are localized", () => {
  assert.equal(text("zh-CN", "scopeQuestion"), "安装范围");
  assert.equal(text("zh-CN", "platformsQuestion"), "要配置的平台");
  assert.equal(text("zh-CN", "mattQuestion"), "是否安装缺失的 Matt Pocock skills？");
  assert.equal(text("zh-CN", "replaceQuestion"), "现有 Matrix 文件无法确认由 Matrix 管理。是否备份并替换？");
  assert.equal(text("zh-CN", "yes"), "是");
  assert.equal(text("zh-CN", "actionBackupReplace"), "备份并替换");
});
