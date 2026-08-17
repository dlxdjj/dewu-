import Link from "next/link";
import ThemeIcon from "@/components/theme/ThemeIcon";

const PAGE_COPY: Record<string, { kicker: string; title: string; subtitle: string }> = {
  "cirrus:首页": { kicker: "进销存", title: "今天的经营结果，\n清楚又从容", subtitle: "库存、利润、运费和返利已同步" },
  "spritecraft:首页": { kicker: "PLAYER / BUSINESS", title: "经营冒险日志", subtitle: "库存、利润与任务进度" },
  "voltura:首页": { kicker: "OPERATIONS / LIVE", title: "经营总览", subtitle: "库存与收益实时同步" },
  "lumen:首页": { kicker: "SYSTEM / COMMAND", title: "经营总览", subtitle: "数据同步正常" },
  "cirrus:库存": { kicker: "库存", title: "库存状态，\n一眼就明白", subtitle: "搜索、筛选并处理每一件商品" },
  "spritecraft:库存": { kicker: "INVENTORY / BAG", title: "库存背包", subtitle: "查看物品、状态与数量" },
  "voltura:库存": { kicker: "INVENTORY / CONTROL", title: "库存管理", subtitle: "追踪商品流转与资金占用" },
  "lumen:库存": { kicker: "INVENTORY / SIGNAL", title: "库存管理", subtitle: "状态与数量实时同步" },
  "cirrus:添加": { kicker: "添加", title: "录入一批采购，\n简单一点", subtitle: "支持小数价格与图片自动裁黑边" },
  "spritecraft:添加": { kicker: "NEW ITEM / CRAFT", title: "录入新物品", subtitle: "表格、图片与采购信息" },
  "voltura:添加": { kicker: "PROCUREMENT / INPUT", title: "录入采购", subtitle: "商品、图片与初始状态" },
  "lumen:添加": { kicker: "PROCUREMENT / INPUT", title: "录入采购", subtitle: "商品、图片与初始状态" },
  "cirrus:报表": { kicker: "报表", title: "每个月的经营，\n都有迹可循", subtitle: "销售、利润、运费和返利统一计算" },
  "spritecraft:报表": { kicker: "REPORT / SCORE", title: "经营结算榜", subtitle: "收入、成本与本月战绩" },
  "voltura:报表": { kicker: "FINANCE / REPORT", title: "经营报表", subtitle: "销售、利润、运费与返利" },
  "lumen:报表": { kicker: "FINANCE / REPORT", title: "经营报表", subtitle: "销售、利润、运费与返利" },
  "cirrus:设置": { kicker: "设置", title: "账户与应用设置", subtitle: "主题、数据维护与安全操作" },
  "spritecraft:设置": { kicker: "SYSTEM / OPTIONS", title: "游戏设置", subtitle: "主题、账户与数据维护" },
  "voltura:设置": { kicker: "SYSTEM / SETTINGS", title: "系统设置", subtitle: "账户、外观与数据维护" },
  "lumen:设置": { kicker: "SYSTEM / SETTINGS", title: "系统设置", subtitle: "账户、外观与数据维护" },
};

export default function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="page-header" data-page-title={title}>
      <div className="page-header-copy">
        {(["cirrus", "spritecraft", "voltura", "lumen"] as const).map((theme) => {
          const copy = PAGE_COPY[`${theme}:${title}`] ?? { kicker: title, title, subtitle: subtitle ?? "" };
          return (
            <div key={theme} className="page-header-variant" data-copy-theme={theme}>
              <p className="page-header-kicker">{copy.kicker}</p>
              <h1>
                {copy.title.split("\n").map((line, index) => (
                  <span key={`${line}-${index}`} className="page-header-title-line">{line}</span>
                ))}
              </h1>
              {copy.subtitle && <p className="page-header-subtitle">{copy.subtitle}</p>}
            </div>
          );
        })}
        {subtitle && <p className="page-header-live-meta">{subtitle}</p>}
      </div>
      {title !== "设置" && (
        <Link href="/settings" aria-label="设置" className="page-header-action">
          <ThemeIcon name="settings" size={20} />
        </Link>
      )}
    </header>
  );
}
