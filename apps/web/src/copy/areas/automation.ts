/**
 * 自动化页（`/automation`）文案：来源表单入口与三个分区的锚点标题。
 * 表单本体与计划列表的文案属组件级批次，见 Task 35 的 Follow-ups。
 */
export const automation = {
    title: "自动化",
    description: "来源、采集计划、账号与运行记录",
    checkService: "检查服务",
    newSource: "新建来源",
    closeForm: "关闭表单",
    source: {
        dialogTitle: "新建来源",
        dialogDescription: "配置来源、抓取频率与可选账号；保存后会生成一个停用的采集计划。",
        cancel: "取消",
    },
    plans: "采集计划",
    connections: "账号",
    runHistory: "运行记录",
    /** 账号区（Task 37）：创建入口从常驻内联表单改成按钮 + 模态框。 */
    connection: {
        newButton: "新建账号",
        dialogTitle: "新建账号",
        dialogDescription:
            "账号保存的是登录凭据的引用，不是凭据本身。适配器配置与授权范围是可选的补充说明。",
        submit: "保存账号",
        cancel: "取消",
        empty: "尚未创建账号；接入认证类平台前无需配置。",
    },
} as const;
