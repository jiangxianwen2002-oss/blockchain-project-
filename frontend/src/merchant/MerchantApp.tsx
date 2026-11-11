// 商家端：入驻开店。商家连接自己的钱包，通过官方开店工厂 ShopFactory 创建一家店（AgentShop 合约）。
// 工厂固定了平台规则（绑定哪个金库、收什么币、仲裁人是谁、最短确认期），商家只能填店名、简介和菜单，改不了代码。
// 开好以后把店铺地址发给用户，用户在控制台 → 商家白名单里检查并导入。
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnect, useConnection, useConnectors, useDisconnect, usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { parseUnits, type Address } from "viem";
import { Copy, Plus, Store, Trash2, Wallet } from "lucide-react";
import { agentShopAbi, agentVaultAbi, shopFactoryAbi } from "../generated/abi";
import { dep, FACTORY, short, VAULT } from "../config";
import { useTx } from "../hooks";
import { Badge, ExtLink, addrLink, TxToast } from "../shared/ui";
import { injectionHints } from "../console/pages/Merchants";
import { LangToggle, t, tn } from "../i18n";

type Row = { name: string; price: string; stock: string };
const bytes = (s: string) => new TextEncoder().encode(s).length;

function useFactoryRules() {
  const r = useReadContracts({
    contracts: [
      { address: FACTORY, abi: shopFactoryAbi, functionName: "minConfirmWindow" },
      { address: FACTORY, abi: shopFactoryAbi, functionName: "arbiter" },
      { address: FACTORY, abi: shopFactoryAbi, functionName: "shopCount" },
    ],
  });
  return {
    minWindow: Number((r.data?.[0]?.result as bigint | undefined) ?? 60n),
    arbiter: r.data?.[1]?.result as Address | undefined,
    count: Number((r.data?.[2]?.result as bigint | undefined) ?? 0n),
  };
}

/** 我开过的店：读工厂的 ShopCreated 事件（按店主过滤） */
function useMyShops(owner?: Address) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["my-shops", owner],
    enabled: Boolean(client && owner),
    refetchInterval: 15000,
    queryFn: async () => {
      const logs = await client!.getContractEvents({ address: FACTORY, abi: shopFactoryAbi, eventName: "ShopCreated", args: { owner }, fromBlock: BigInt(dep.shopsDeployBlock ?? dep.deployBlock) });
      return logs.map((l) => ({ shop: l.args.shop as Address, name: l.args.name as string, block: l.blockNumber })).reverse();
    },
  });
}

function MyShops({ owner }: { owner: Address }) {
  const { data = [], isLoading } = useMyShops(owner);
  const listed = useReadContracts({
    contracts: data.map((s) => ({ address: VAULT, abi: agentVaultAbi, functionName: "isMerchant" as const, args: [s.shop] as const })),
    query: { enabled: data.length > 0, refetchInterval: 15000 },
  });
  const counts = useReadContracts({
    contracts: data.map((s) => ({ address: s.shop, abi: agentShopAbi, functionName: "getItems" as const })),
    query: { enabled: data.length > 0 },
  });
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{t("我的店", "My shops")}</h2>
          <span className="faint small">{t("把店铺地址发给用户，用户在控制台 → 商家白名单里检查后导入，AI 就能来下单。", "Send your shop address to users; once they check and import it in Console → Whitelist, their AI can order from you.")}</span>
        </div>
      </div>
      {isLoading ? (
        <div className="empty">{t("读取中…", "Loading…")}</div>
      ) : data.length === 0 ? (
        <div className="empty">{t("这个钱包还没有开过店", "This wallet hasn't opened a shop yet")}</div>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>{t("店名", "Shop")}</th><th>{t("店铺地址", "Address")}</th><th className="hide-sm">{t("商品", "Items")}</th><th>{t("用户白名单", "User whitelist")}</th></tr></thead>
            <tbody>
              {data.map((s, i) => (
                <tr key={s.shop}>
                  <td>{tn(s.name)}</td>
                  <td>
                    <span className="cell-shop">
                      <ExtLink href={`${addrLink(s.shop)}#code`} className="mono faint">{short(s.shop)}</ExtLink>
                      <button className="btn btn-ghost btn-sm" aria-label={t("复制地址", "Copy address")} onClick={() => navigator.clipboard?.writeText(s.shop)}><Copy size={13} /></button>
                    </span>
                  </td>
                  <td className="hide-sm faint">{(counts.data?.[i]?.result as unknown[] | undefined)?.length ?? "—"} {t("项", "items")}</td>
                  <td>{listed.data?.[i]?.result ? <Badge tone="ok">{t("已被导入", "Imported")}</Badge> : <Badge>{t("未导入", "Not imported")}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function OpenShop({ minWindow }: { minWindow: number }) {
  const tx = useTx();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [minutes, setMinutes] = useState("1440");
  const [rows, setRows] = useState<Row[]>([{ name: "", price: "", stock: "999" }]);
  const set = (i: number, k: keyof Row, v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const items = rows.filter((r) => r.name.trim());
  const windowSec = Math.round(Number(minutes) * 60);
  const errors = [
    !name.trim() && t("请填写店名", "Enter a shop name"),
    bytes(name) > 96 && t("店名太长（最多 96 字节，约 32 个汉字）", "Name too long (max 96 bytes)"),
    bytes(desc) > 600 && t("简介太长（最多 600 字节，约 200 个汉字）", "Description too long (max 600 bytes)"),
    items.length === 0 && t("至少要有一个商品", "Add at least one item"),
    items.length > 100 && t("商品最多 100 个", "At most 100 items"),
    items.some((r) => !/^\d+(\.\d{1,2})?$/.test(r.price) || Number(r.price) <= 0) && t("价格要是大于 0 的数字（最多两位小数）", "Prices must be numbers above 0 (2 decimals max)"),
    items.some((r) => !/^\d+$/.test(r.stock)) && t("库存要是整数", "Stock must be a whole number"),
    !(windowSec >= minWindow) && t(`确认期不能短于平台规定的 ${Math.ceil(minWindow / 60)} 分钟`, `The confirm window can't be shorter than the platform minimum of ${Math.ceil(minWindow / 60)} min`),
  ].filter(Boolean) as string[];
  const hints = [desc, ...items.map((r) => r.name)].flatMap((t) => injectionHints(t));

  async function submit() {
    const ok = await tx.send(t("开店", "Open shop"), {
      address: FACTORY,
      abi: shopFactoryAbi,
      functionName: "createShop",
      args: [name.trim(), desc.trim(), BigInt(windowSec), items.map((r) => r.name.trim()), items.map((r) => parseUnits(r.price, 6)), items.map((r) => Number(r.stock))],
    });
    if (ok) {
      setName("");
      setDesc("");
      setRows([{ name: "", price: "", stock: "999" }]);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{t("开一家新店", "Open a new shop")}</h2>
          <span className="faint small">{t("店铺合约由官方工厂按统一模板创建，你是店主：负责发货、改菜单、提现。", "The official factory creates the shop contract from a standard template. You're the owner: you deliver, edit the menu and withdraw.")}</span>
        </div>
      </div>
      <div className="panel-pad stack">
        <label className="field">
          <span>{t("店名", "Shop name")}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("例如：街角面包房", "e.g. Corner Bakery")} />
        </label>
        <label className="field">
          <span>{t("简介 / 公告", "Description / notice")}</span>
          <textarea className="input textarea" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("例如：现烤面包，20 分钟送达", "e.g. Fresh bread, 20-min delivery")} />
        </label>
        <label className="field" style={{ maxWidth: 260 }}>
          <span>{t("确认期（分钟）", "Confirm window (minutes)")}</span>
          <input className="input num" value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" />
          <span className="faint small">{t("送达后这么久买家没确认，就自动放款；在这期间买家可以申诉。", "If the buyer doesn't confirm within this time after delivery, payment is released automatically. The buyer can dispute during this window.")}</span>
        </label>

        <div className="field">
          <span>{t("菜单", "Menu")}</span>
          <div className="menu-rows">
            <div className="menu-row faint small"><span>{t("商品名", "Item name")}</span><span>{t("价格（mUSDC）", "Price (mUSDC)")}</span><span>{t("库存", "Stock")}</span><span /></div>
            {rows.map((r, i) => (
              <div className="menu-row" key={i}>
                <input className="input" value={r.name} onChange={(e) => set(i, "name", e.target.value)} placeholder={t("商品名", "Item name")} />
                <input className="input num" value={r.price} onChange={(e) => set(i, "price", e.target.value)} placeholder="12.5" inputMode="decimal" />
                <input className="input num" value={r.stock} onChange={(e) => set(i, "stock", e.target.value)} inputMode="numeric" />
                <button className="btn btn-ghost btn-sm" aria-label={t("删除", "Delete")} disabled={rows.length === 1} onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <div><button className="btn btn-sm" onClick={() => setRows((x) => [...x, { name: "", price: "", stock: "999" }])}><Plus size={14} /> {t("添加商品", "Add item")}</button></div>
        </div>

        {hints.length > 0 && (
          <p className="small bad-text">{t(`店名或商品名里有像是写给 AI 的指令（${[...new Set(hints)].join("、")}）。用户导入时会看到警告，AI 也会提醒用户，建议改掉。`, `The name or item names look like instructions aimed at the AI (${[...new Set(hints)].join(", ")}). Users will see a warning on import and the AI will flag it — better to change them.`)}</p>
        )}
        {name && errors.length > 0 && <p className="small bad-text">{errors[0]}</p>}
        <div className="btn-row">
          <button className="btn btn-primary" disabled={errors.length > 0 || tx.state.kind === "busy"} onClick={submit}><Store size={15} /> {t("开店", "Open shop")}</button>
        </div>
        <TxToast state={tx.state} onClose={tx.clear} />
      </div>
    </section>
  );
}

export function MerchantApp() {
  const { address, isConnected, chainId } = useConnection();
  const connectors = useConnectors();
  const { mutate: connect } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const rules = useFactoryRules();
  const vaultOwner = useReadContract({ address: VAULT, abi: agentVaultAbi, functionName: "owner" }).data as Address | undefined;

  return (
    <div className="merchant">
      <header className="top">
        <h1><Store size={18} /> {t("商家入驻", "Merchant onboarding")}</h1>
        <div className="top-right">
          <LangToggle />
          <button className="btn btn-sm" onClick={() => (isConnected ? disconnect() : connectors[0] && connect({ connector: connectors[0] }))}>
            <Wallet size={14} /> {isConnected && address ? short(address) : t("连接钱包", "Connect wallet")}
          </button>
        </div>
      </header>
      <div className="page stack narrow">
        <section className="panel panel-pad">
          <h2>{t("平台规则（写在官方工厂合约里，谁都改不了）", "Platform rules (fixed in the official factory contract)")}</h2>
          <dl className="kv flush">
            <div><dt>{t("官方工厂", "Official factory")}</dt><dd><ExtLink href={`${addrLink(FACTORY)}#code`} className="mono">{short(FACTORY)}</ExtLink></dd></div>
            <div><dt>{t("收款币种", "Currency")}</dt><dd>{t("mUSDC（测试用稳定币）", "mUSDC (test stablecoin)")}</dd></div>
            <div><dt>{t("最短确认期", "Minimum confirm window")}</dt><dd>{Math.ceil(rules.minWindow / 60)} {t("分钟", "min")}</dd></div>
            <div><dt>{t("平台仲裁人", "Platform arbiter")}</dt><dd>{rules.arbiter ? <ExtLink href={addrLink(rules.arbiter)} className="mono">{short(rules.arbiter)}</ExtLink> : "—"}{t("（只能裁决申诉中的订单）", " (can only rule on disputed orders)")}</dd></div>
            <div><dt>{t("已入驻", "Shops opened")}</dt><dd>{rules.count}</dd></div>
          </dl>
          <p className="faint small">{t("开店不需要平台审批，但只有用户把你的店导入自己的白名单后，用户的 AI 才能向你付款。", "Opening a shop needs no platform approval, but a user's AI can only pay you after the user imports your shop into their whitelist.")}</p>
        </section>

        {!isConnected || !address ? (
          <section className="panel empty">{t("连接你的商家钱包后开店（需要一点 Sepolia ETH 付 gas）", "Connect your merchant wallet to open a shop (needs a little Sepolia ETH for gas)")}</section>
        ) : chainId !== 11155111 ? (
          <section className="panel empty">{t("请在钱包里切换到 Sepolia 测试网", "Switch your wallet to the Sepolia testnet")}</section>
        ) : (
          <>
            {vaultOwner && address.toLowerCase() === vaultOwner.toLowerCase() && (
              <p className="small muted">{t("提示：你连接的是金库主人的钱包。演示时最好换成单独的商家钱包，这样更接近真实情况。", "Note: this is the vault owner's wallet. For a realistic demo use a separate merchant wallet.")}</p>
            )}
            <OpenShop minWindow={rules.minWindow} />
            <MyShops owner={address} />
          </>
        )}
      </div>
    </div>
  );
}
