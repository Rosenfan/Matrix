export const messages = {
  en: {
    title: "Evidence-driven workflow with Prim and Arch orchestration",
    recommended: "Recommended setup", apply: "Apply", customize: "Customize", cancel: "Cancel",
    project: "Project (current directory)", global: "Global Matrix Skills",
    copy: "Copy (recommended)", symlink: "Symlink (advanced)",
    matrix: "Matrix", matt: "Matt Pocock skills", installed: "installed", ready: "Matrix is ready.",
    noPlatform: "No verified platform was detected. Select Claude Code, Codex, or both.",
    preview: "Planned changes", confirm: "Apply these changes?", doctor: "Installation diagnosis",
    languageQuestion: "Language", scopeQuestion: "Installation scope", platformsQuestion: "Platforms", orchestrationQuestion: "Default orchestration",
    orchestrationArchDetail: "Orchestrates the installed Matt Skills cohort (requires Matt Skills).", orchestrationPrimDetail: "Uses Matrix's own capabilities only (no Matt dependency).",
    readyHint: "Type $matrix followed by your request in {platform} to start the evidence-driven workflow.",
    mattQuestion: "Install or reconcile the supported Matt Pocock release in this project?", replaceQuestion: "Existing Matrix files are not proven managed. Back up and replace?",
    mattReplaceQuestion: "Matt Skills contain local or unreadable content. Back them up and replace them with the supported release?",
    mattRepairQuestion: "Matt Skills are {state}. Re-pull the supported release ({release}) now?",
    updateScopeQuestion: "Update scope", updateScopeCurrent: "Current project only", updateScopeAll: "All indexed projects",
    yes: "Yes", no: "No", stateMissing: "missing", stateMatching: "up to date", stateComplete: "complete", stateUserModified: "user-modified", statePartial: "partial", stateOutdated: "outdated", stateSafeUpdate: "safe update", stateAdoptable: "adoptable", stateUnreadable: "unreadable", stateCompatible: "compatible", stateUpdateRequired: "update required", stateUnsupportedNewer: "unsupported newer", stateUnverified: "unverified", stateUnknown: "unknown",
    actionInstall: "install", actionKeep: "keep", actionBackupReplace: "back up and replace", actionRepair: "repair", actionBlocked: "requires approval",
    dryRunComplete: "Dry run complete.", defaultOrchestration: "Default orchestration", mattCompatibilityStatus: "Matt {release}: {status}",
    manifestMissing: "No Matrix installation manifest was found for this scope.", transactionPending: "An interrupted Matrix transaction is awaiting recovery. Run matrix init again before applying a new plan.", runtimeMissing: "Bundled Matrix runtime is missing.", brokenLink: "Broken Matrix link detected.", mattGlobalIgnored: "global Matt Skills are present but ignored by the project compatibility contract.", mattSetupHint: "Matt {release} is installed for this project. Optionally run $setup-matt-pocock-skills once to configure its user-owned integrations.",
    matrixModifiedDiagnostic: "{platform}: existing Matrix assets are not proven managed.", mattModifiedDiagnostic: "{platform}: Matt Skills contain local or unreadable content that requires separate replacement approval.", archIncompleteDiagnostic: "Arch requires the exact reviewed cohort and trusted project receipt. Retry with --with-mattpocock.", matrixStateDiagnostic: "{platform}: Matrix is {state}.", mattStateDiagnostic: "{platform}: Matt Pocock skills are {state}.", codexLegacyDiagnostic: "Codex legacy .codex/skills was detected; Matrix will not write there.", unmanagedExtraDiagnostic: "{platform}: unmanaged extra Skills are preserved and will not be invoked: {skills}."
  },
  "zh-CN": {
    manifestMissing: "当前安装范围没有 Matrix 安装清单。", transactionPending: "发现中断的 Matrix 安装事务。请再次运行 matrix init 后再应用新计划。", runtimeMissing: "缺少随附的 Matrix runtime。", brokenLink: "检测到断开的 Matrix 链接。", mattGlobalIgnored: "检测到全局 Matt Skills，但项目兼容性契约不会采用它们。", mattSetupHint: "已为当前项目安装 Matt {release}。如需配置由用户拥有的集成，可显式运行一次 $setup-matt-pocock-skills。",
    languageQuestion: "语言", scopeQuestion: "安装范围", platformsQuestion: "要配置的平台", orchestrationQuestion: "默认编排模式",
    orchestrationArchDetail: "编排项目内已安装的 Matt Skills 集合（需先安装 Matt）。",
    orchestrationPrimDetail: "仅使用 Matrix 自带能力，不依赖 Matt Skills。",
    readyHint: "在 {platform} 中输入 `$matrix` 加你的请求，即可启动证据驱动工作流。",
    mattQuestion: "是否在当前项目安装或核对 Matrix 支持的 Matt Pocock Release？", replaceQuestion: "现有 Matrix 文件无法确认由 Matrix 管理。是否备份并替换？", mattReplaceQuestion: "Matt Skills 存在本地修改或不可读内容。是否先备份，再替换为受支持的 Release？",
    mattRepairQuestion: "Matt Skills {state}。是否立即重新拉取受支持的 release（{release}）？",
    updateScopeQuestion: "更新范围", updateScopeCurrent: "仅当前项目", updateScopeAll: "全部已索引项目",
    yes: "是", no: "否", stateMissing: "未安装", stateMatching: "已是最新", stateComplete: "完整", stateUserModified: "已被用户修改", statePartial: "不完整", stateOutdated: "可更新", stateSafeUpdate: "可安全更新", stateAdoptable: "可接管", stateUnreadable: "不可读", stateCompatible: "兼容", stateUpdateRequired: "需要更新", stateUnsupportedNewer: "版本过新且不受支持", stateUnverified: "未验证", stateUnknown: "未知",
    actionInstall: "安装", actionKeep: "保留", actionBackupReplace: "备份并替换", actionRepair: "修复", actionBlocked: "需要确认",
    dryRunComplete: "预览完成。", defaultOrchestration: "默认编排", mattCompatibilityStatus: "Matt {release}：{status}",
    title: "提供 Prim 与 Arch 编排的证据驱动工作流",
    recommended: "推荐配置", apply: "开始安装", customize: "自定义", cancel: "取消",
    project: "项目（当前目录）", global: "全局 Matrix Skills",
    copy: "复制（推荐）", symlink: "符号链接（高级）",
    matrix: "Matrix", matt: "Matt Pocock skills", installed: "已安装", ready: "Matrix 已就绪。",
    noPlatform: "未检测到已验证的平台。请选择 Claude Code、Codex，或两者。",
    preview: "计划变更", confirm: "确认应用这些变更？", doctor: "安装诊断",
    matrixModifiedDiagnostic: "{platform}：现有 Matrix 资产无法确认由 Matrix 管理。", mattModifiedDiagnostic: "{platform}：Matt Skills 存在本地修改或不可读内容，需要单独授权替换。", archIncompleteDiagnostic: "Arch 需要精确匹配已审查集合和可信项目 receipt。请使用 --with-mattpocock 重试。", matrixStateDiagnostic: "{platform}：Matrix 状态为 {state}。", mattStateDiagnostic: "{platform}：Matt Pocock Skills 状态为 {state}。", codexLegacyDiagnostic: "检测到 Codex 旧版 .codex/skills；Matrix 不会写入该目录。", unmanagedExtraDiagnostic: "{platform}：将保留但不会调用这些非托管附加 Skills：{skills}。"
  }
};

export function text(language, key) { return messages[language]?.[key] ?? messages.en[key] ?? key; }
