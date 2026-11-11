// 中英文切换：所有界面文字写成 t("中文", "English")。
// 语言存在浏览器里（每个应用一个端口，各存各的）；地址栏带 ?lang=en / ?lang=zh 也能切换，方便四个页面一起切。
// 切换时刷新页面：简单可靠，所有组件和非组件代码（错误提示、地址名称）都会用新语言重新渲染。
import { Languages } from "lucide-react";

export type Lang = "zh" | "en";
const KEY = "agentvault.lang";

function detect(): Lang {
  try {
    const q = new URLSearchParams(location.search).get("lang");
    if (q === "en" || q === "zh") {
      localStorage.setItem(KEY, q);
      return q;
    }
    const saved = localStorage.getItem(KEY);
    if (saved === "en" || saved === "zh") return saved;
  } catch {
    /* 浏览器不让存：用默认中文 */
  }
  return "zh";
}

export const lang: Lang = detect();
export const isEn = lang === "en";
/** 界面文字：t("中文", "English") */
export const t = (zh: string, en: string) => (isEn ? en : zh);
/** 日期、数字格式 */
export const locale = isEn ? "en-US" : "zh-CN";
/** 练习环境在标签标题前加个标记，免得和正式演示环境搞混（正式环境什么都不加） */
export const envTag = (rehearsal: boolean) => (rehearsal ? (isEn ? "[Rehearsal] " : "[练习] ") : "");
document.documentElement.lang = isEn ? "en" : "zh-CN";

export function setLang(l: Lang) {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* 忽略 */
  }
  const u = new URL(location.href);
  u.searchParams.set("lang", l);
  location.href = u.toString();
}

/** 顶栏的语言切换按钮 */
export function LangToggle({ className = "btn btn-sm" }: { className?: string }) {
  return (
    <button className={className} onClick={() => setLang(isEn ? "zh" : "en")} title={t("切换到英文", "Switch to Chinese")} aria-label={t("切换语言", "Switch language")}>
      <Languages size={14} /> {isEn ? "中文" : "EN"}
    </button>
  );
}

// ─────────────── 链上数据的英文显示名 ───────────────
// 店名、菜名是商家写在链上的中文，改不了；英文界面只在显示时翻译这些演示用的已知名字，没登记的原样显示。
const NAMES: Record<string, string> = {
  "饭点到·家常小厨": "FanDian Home Kitchen",
  "一点甜·奶茶咖啡": "YiDianTian Tea & Coffee",
  "快到·打车": "KuaiDao Rides",
  "天天特价·首单1折": "Daily Deals · 90% Off First Order",
  "小卖部·便利店": "Corner Store",
  "云间外卖 CloudEats": "CloudEats",
  "家常快餐，30 分钟送达": "Home-style meals, 30-min delivery",
  "现做奶茶咖啡，20 分钟送达": "Fresh milk tea & coffee, 20-min delivery",
  "经济型网约车，司机约 3 分钟到达": "Economy rides, driver arrives in ~3 min",
  "饮料零食日用品，10 分钟送达": "Drinks, snacks & essentials, 10-min delivery",
  "番茄牛腩饭（不辣）": "Tomato Beef Brisket Rice (mild)",
  "宫保鸡丁饭（微辣）": "Kung Pao Chicken Rice (a bit spicy)",
  "麻辣香锅·单人（辣）": "Spicy Dry Pot, single (spicy)",
  "鲜虾云吞面（不辣）": "Shrimp Wonton Noodles (mild)",
  "照烧鸡腿便当（不辣）": "Teriyaki Chicken Bento (mild)",
  "冰红茶": "Iced Black Tea",
  "例汤": "Soup of the Day",
  "珍珠奶茶": "Bubble Milk Tea",
  "杨枝甘露": "Mango Pomelo Sago",
  "生椰拿铁": "Coconut Latte",
  "美式咖啡（无糖）": "Americano (no sugar)",
  "柠檬茶（无奶）": "Lemon Tea (no milk)",
  "短途（3 公里内）": "Short trip (under 3 km)",
  "公司 → 家（8 公里）": "Office → Home (8 km)",
  "市区 → 高铁站": "Downtown → Rail Station",
  "市区 → 机场": "Downtown → Airport",
  "会员激活费（必选）": "Membership Activation Fee (required)",
  "招牌牛排套餐（1 折，原价 60）": "Signature Steak Set (90% off, was 60)",
  "小龙虾饭（1 折，原价 50）": "Crayfish Rice (90% off, was 50)",
  "矿泉水": "Mineral Water",
  "可乐": "Cola",
  "薯片": "Potato Chips",
  "三明治": "Sandwich",
  "纸巾": "Tissues",
  "汉堡工坊": "Burger Lab",
  "川味小馆": "Sichuan Bistro",
  "轻食沙拉": "Salad Bar",
  "茶语": "TeaTalk",
  "双层牛肉堡套餐": "Double Beef Burger Combo",
  "香辣鸡腿堡": "Spicy Chicken Burger",
  "水煮鱼单人份": "Sichuan Boiled Fish (single)",
  "麻婆豆腐饭": "Mapo Tofu Rice",
  "鸡胸肉凯撒沙拉": "Chicken Caesar Salad",
  "外卖": "Food delivery",
  "奶茶咖啡": "Tea & coffee",
  "打车": "Rides",
  "便利店": "Convenience store",
  "外卖平台": "Delivery platform",
  "外卖（未审核新店）": "Food delivery (new, unverified)",
  "商家": "Shop",
  "30 分钟送达": "30-min delivery",
  "20 分钟送达": "20-min delivery",
  "10 分钟送达": "10-min delivery",
  "15 分钟送达": "15-min delivery",
  "司机约 3 分钟到达": "Driver in ~3 min",
};
const SUFFIX: [RegExp, string][] = [
  [/（v2 旧合约）$/, " (v2, retired)"],
  [/（v1 收款地址）$/, " (v1 address)"],
  [/（旧商家）$/, " (old shop)"],
];
/** 链上的中文名字 → 英文界面显示名（未登记的原样返回） */
export function tn(name: string | undefined): string {
  if (!name || !isEn) return name ?? "";
  if (NAMES[name]) return NAMES[name];
  for (const [re, en] of SUFFIX) if (re.test(name)) return tn(name.replace(re, "")) + en;
  if (name.includes("·")) {
    const parts = name.split("·");
    if (parts.every((p) => NAMES[p])) return parts.map((p) => NAMES[p]).join(" · ");
  }
  return name;
}
