export const messages = {
  en: {
    title: "Evidence-driven workflow for Matt Pocock's agent skills",
    recommended: "Recommended setup", apply: "Apply", customize: "Customize", cancel: "Cancel",
    project: "Project (current directory)", global: "Global (all projects)",
    copy: "Copy (recommended)", symlink: "Symlink (advanced)",
    matrix: "Matrix", matt: "Matt Pocock skills", installed: "installed", ready: "Matrix is ready.",
    noPlatform: "No verified platform was detected. Select Claude Code, Codex, or both.",
    preview: "Planned changes", confirm: "Apply these changes?", doctor: "Installation diagnosis",
    languageQuestion: "Language", scopeQuestion: "Installation scope", platformsQuestion: "Platforms",
    mattQuestion: "Install missing Matt Pocock skills?", replaceQuestion: "Existing Matrix files are not proven managed. Back up and replace?",
    yes: "Yes", no: "No", stateMissing: "missing", stateMatching: "up to date", stateComplete: "complete", stateUserModified: "user-modified", statePartial: "partial", stateOutdated: "outdated",
    actionInstall: "install", actionKeep: "keep", actionBackupReplace: "back up and replace", actionRepair: "repair", actionBlocked: "requires approval",
    dryRunComplete: "Dry run complete.", manifestMissing: "No Matrix installation manifest was found for this scope.", transactionPending: "An interrupted Matrix transaction is awaiting recovery. Run matrix init again before applying a new plan.", runtimeMissing: "Bundled Matrix runtime is missing.", brokenLink: "Broken Matrix link detected.", mattInherited: "Matt skills are satisfied by the global installation."
  },
  "zh-CN": {
    manifestMissing: "当前安装范围没有 Matrix 安装清单。", transactionPending: "发现中断的 Matrix 安装事务。请再次运行 matrix init 后再应用新计划。", runtimeMissing: "缺少随附的 Matrix runtime。", brokenLink: "检测到断开的 Matrix 链接。", mattInherited: "Matt skills 由全局安装提供。",
    languageQuestion: "语言", scopeQuestion: "安装范围", platformsQuestion: "要配置的平台",
    mattQuestion: "是否安装缺失的 Matt Pocock skills？", replaceQuestion: "现有 Matrix 文件无法确认由 Matrix 管理。是否备份并替换？",
    yes: "是", no: "否", stateMissing: "未安装", stateMatching: "已是最新", stateComplete: "完整", stateUserModified: "已被用户修改", statePartial: "不完整", stateOutdated: "可更新",
    actionInstall: "安装", actionKeep: "保留", actionBackupReplace: "备份并替换", actionRepair: "修复", actionBlocked: "需要确认",
    dryRunComplete: "预览完成。",
    title: "面向 Matt Pocock Agent Skills 的证据驱动工作流",
    recommended: "推荐配置", apply: "开始安装", customize: "自定义", cancel: "取消",
    project: "项目（当前目录）", global: "全局（所有项目）",
    copy: "复制（推荐）", symlink: "符号链接（高级）",
    matrix: "Matrix", matt: "Matt Pocock skills", installed: "已安装", ready: "Matrix 已就绪。",
    noPlatform: "未检测到已验证的平台。请选择 Claude Code、Codex，或两者。",
    preview: "计划变更", confirm: "确认应用这些变更？", doctor: "安装诊断"
  }
};

export function text(language, key) { return messages[language]?.[key] ?? messages.en[key] ?? key; }
