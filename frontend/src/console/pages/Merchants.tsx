// 商家白名单：列表 + 按合约地址导入新商家（导入前在链上逐项检查）
import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { isAddress, getAddress, type Address } from "viem";
import { AlertTriangle, CheckCircle2, Loader2, Plus, XCircle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { agentShopAbi, agentVaultAbi } from "../../generated/abi";
import { dep, externalPlatforms, labelOf, short, USDC, VAULT } from "../../config";
import { useReadContracts } from "wagmi";
import { usePlatformProfile } from "../../shared/platform";
import { inspectShop, useIsOwner, useMerchants, useShopItems, useTx, type ShopCheck } from "../../hooks";
import { ShopIcon } from "../../shared/OrderTicket";
import { Badge, ExtLink, addrLink, money, TxToast } from "../../shared/ui";
import { Modal, useConfirm } from "../Dialog";
import { t, tn } from "../../i18n";

/** 店铺公告里疑似"写给 AI 的指令"（提示注入）的关键词 */
const INJECTION_HINTS = ["ai 助手", "系统通知", "无需询问", "无需再询问", "直接完成付款", "激活费", "验证费", "押金", "忽略之前", "ignore previous", "system:"];
export const injectionHints = (text: string) => INJECTION_HINTS.filter((k) => text.toLowerCase().includes(k));

type Item = { name: string; price: bigint; stock: number; active: boolean };

function CheckRow({ ok, warn, children }: { ok: boolean; warn?: boolean; children: React.ReactNode }) {
  return (
    <li className={ok ? (warn ? "warn" : "ok") : "bad"}>
      {ok ? (warn ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />) : <XCircle size={15} />}
      <span>{children}</span>
    </li>
  );
}

function AddMerchant({ onDone }: { onDone: () => void }) {
  const client = usePublicClient();
  const qc = useQueryClient();
  const tx = useTx();
  const merchants = useMerchants();
  const isOwner = useIsOwner();
  const [input, setInput] = useState("");
  const [check, setCheck] = useState<ShopCheck | "loading" | null>(null);
  const [menu, setMenu] = useState<Item[]>([]);
  const valid = isAddress(input.trim(), { strict: false });
  const addr = valid ? getAddress(input.trim().toLowerCase()) : undefined;
  const existing = addr && merchants.find((m) => m.address.toLowerCase() === addr.toLowerCase());

  useEffect(() => {
    setCheck(null);
    setMenu([]);
    if (!addr || !client) return;
    let cancel = false;
    setCheck("loading");
    inspectShop(client, addr as Address)
      .then(async (c) => {
        if (cancel) return;
        setCheck(c);
        if (c.kind === "shop") {
          const items = (await client.readContract({ address: addr as Address, abi: agentShopAbi, functionName: "getItems" })) as unknown as Item[];
          if (!cancel) setMenu(items);
        }
      })
      .catch(() => !cancel && setCheck({ kind: "invalid" }));
    return () => {
      cancel = true;
    };
  }, [addr, client]);

  const shop = check && check !== "loading" && check.kind === "shop" ? check : undefined;
  const hints = shop ? injectionHints(shop.description) : [];
  const canAdd = Boolean(shop?.boundHere && shop.tokenOk && !existing?.allowed);
  const busy = tx.state.kind === "busy";

  async function add() {
    if (!addr) return;
    await tx.send(t("加入白名单", "Add to whitelist"), { address: VAULT, abi: agentVaultAbi, functionName: "setMerchant", args: [addr, true] });
    await qc.invalidateQueries({ queryKey: ["shops"] });
  }

  return (
    <div className="add-merchant">
      <label className="field">
        <span>{t("商家合约地址", "Shop contract address")}</span>
        <input className="input mono" value={input} onChange={(e) => setInput(e.target.value)} placeholder="0x…" data-autofocus spellCheck={false} />
      </label>
      <p className="faint small">
        {t("商家在商家入驻页（:5175）通过官方工厂开店后，把店铺地址发给你。导入前会在链上逐项检查。", "Merchants open a shop through the official factory on the merchant page (:5175) and send you its address. It's checked on-chain before import.")}
      </p>

      {input && !valid && <p className="small" style={{ color: "var(--bad)" }}>{t("地址格式不对", "Invalid address")}</p>}
      {check === "loading" && <p className="faint small"><Loader2 size={13} className="spin" /> {t("正在读取链上信息…", "Reading on-chain data…")}</p>}

      {check && check !== "loading" && (
        <ul className="checklist">
          <CheckRow ok={check.kind !== "eoa" && check.kind !== "invalid"}>{t("是合约（不是普通钱包地址）", "Is a contract (not a plain wallet)")}</CheckRow>
          {check.kind !== "eoa" && check.kind !== "invalid" && (
            <CheckRow ok={check.kind === "shop"}>{t("支持付款通知接口（IPaymentReceiver）", "Supports the payment-notification interface (IPaymentReceiver)")}</CheckRow>
          )}
          {shop && (
            <>
              <CheckRow ok={shop.boundHere}>
                {t("绑定的是本金库", "Bound to this vault")}{!shop.boundHere && t(`（它绑定的是 ${short(shop.vault)}，付款会全部失败）`, ` (it's bound to ${short(shop.vault)}; all payments would fail)`)}
              </CheckRow>
              <CheckRow ok={shop.tokenOk}>{t("收款币种是 mUSDC", "Accepts mUSDC")}</CheckRow>
              <CheckRow ok={hints.length === 0} warn={hints.length > 0}>
                {hints.length === 0 ? t("店铺公告里没有发现写给 AI 的指令", "No instructions aimed at the AI in the shop notice") : t(`店铺公告里有疑似写给 AI 的指令（${hints.join("、")}），请谨慎`, `The shop notice seems to contain instructions aimed at the AI (${hints.join(", ")}). Be careful.`)}
              </CheckRow>
            </>
          )}
        </ul>
      )}

      {shop && (
        <div className="shop-preview">
          <dl className="kv flush">
            <div><dt>{t("店名", "Name")}</dt><dd>{tn(shop.name)}</dd></div>
            <div><dt>{t("店主", "Owner")}</dt><dd><ExtLink href={addrLink(shop.owner)} className="mono">{short(shop.owner)}</ExtLink></dd></div>
            <div><dt>{t("自动放款期", "Auto-release")}</dt><dd>{t(`送达后 ${Math.round(shop.confirmWindow / 60)} 分钟`, `${Math.round(shop.confirmWindow / 60)} min after delivery`)}</dd></div>
            <div><dt>{t("源码", "Source")}</dt><dd><ExtLink href={`${addrLink(addr!)}#code`}>{t("在 Etherscan 查看", "View on Etherscan")}</ExtLink></dd></div>
          </dl>
          {shop.description && <p className="preview-desc">“{shop.description}”</p>}
          <div className="preview-menu">
            {menu.slice(0, 6).map((it, i) => (
              <div key={i}><span>{it.name}</span><span className="num muted">{money(it.price)}</span></div>
            ))}
            {menu.length > 6 && <div className="faint small">{t(`还有 ${menu.length - 6} 项`, `${menu.length - 6} more`)}</div>}
          </div>
        </div>
      )}

      {existing?.allowed && <p className="small muted">{t("这家店已经在白名单里了。", "This shop is already whitelisted.")}</p>}
      {!isOwner && shop && <p className="small muted">{t("检查谁都可以做；加入白名单需要用管理员钱包连接。", "Anyone can check; adding to the whitelist needs the admin wallet.")}</p>}

      <div className="modal-foot">
        <button className="btn" onClick={onDone}>{tx.state.kind === "ok" ? t("完成", "Done") : t("取消", "Cancel")}</button>
        <button className="btn btn-primary" disabled={!isOwner || !canAdd || busy || tx.state.kind === "ok"} onClick={add}>
          {t("加入白名单", "Add to whitelist")}
        </button>
      </div>
      <TxToast state={tx.state} onClose={tx.clear} />
    </div>
  );
}

export function Merchants() {
  const merchants = useMerchants();
  const menus = useShopItems();
  const isOwner = useIsOwner();
  const tx = useTx();
  const busy = tx.state.kind === "busy";
  const [adding, setAdding] = useState(false);
  const [confirmDialog, confirm] = useConfirm();
  const qc = useQueryClient();

  async function toggle(m: (typeof merchants)[number]) {
    if (m.allowed) {
      const ok = await confirm({
        title: t(`移出「${m.name}」？`, `Remove ${tn(m.name)}?`),
        body: t("移出后 AI 立刻不能再向这家店付款。已经付款、在托管中的订单不受影响，仍可正常送达、放款或退款。", "The AI immediately can't pay this shop anymore. Orders already paid and in escrow are unaffected and can still be delivered, released or refunded."),
        confirm: t("移出白名单", "Remove"),
        danger: true,
      });
      if (!ok) return;
    } else if (m.flagged || injectionHints(m.description ?? "").length) {
      const ok = await confirm({
        title: t(`加入「${m.name}」？`, `Add ${tn(m.name)}?`),
        body: t("这家店的公告里有疑似写给 AI 的指令（例如要求先付激活费）。加入白名单后，AI 就可以向它付款。", "This shop's notice seems to contain instructions aimed at the AI (e.g. demanding an activation fee). Once whitelisted, the AI can pay it."),
        confirm: t("仍然加入", "Add anyway"),
        danger: true,
      });
      if (!ok) return;
    }
    await tx.send(m.allowed ? `${t("移出", "Remove")} ${tn(m.name)}` : `${t("加入", "Add")} ${tn(m.name)}`, { address: VAULT, abi: agentVaultAbi, functionName: "setMerchant", args: [m.address, !m.allowed] });
    qc.invalidateQueries({ queryKey: ["shops"] });
  }

  // 旧版（v2）商家合约已停用，不在这里显示（历史订单和对账里仍然能看到）
  const sorted = merchants.filter((m) => !m.legacy).sort((a, b) => Number(b.allowed) - Number(a.allowed));

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>{t("商家合约", "Shop contracts")}</h2>
            <span className="faint small">{t("AI 只能向白名单里的合约付款，其他地址会被合约直接拒绝。白名单存在链上，AI 每次购物前都会重新读取。", "The AI can only pay whitelisted addresses; the contract rejects everything else. The whitelist lives on-chain and the AI re-reads it before every purchase.")}</span>
          </div>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            <Plus /> {isOwner ? t("添加商家", "Add shop") : t("检查商家合约", "Check a shop contract")}
          </button>
        </div>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr><th>{t("商家", "Shop")}</th><th className="hide-sm">{t("菜单", "Menu")}</th><th>{t("合约", "Contract")}</th><th>{t("白名单", "Whitelist")}</th>{isOwner && <th />}</tr>
            </thead>
            <tbody>
              {sorted.map((m) => {
                const items = menus.get(m.id) ?? [];
                const suspicious = m.flagged || injectionHints(m.description ?? "").length > 0;
                return (
                  <tr key={m.address}>
                    <td>
                      <div className="cell-shop">
                        <ShopIcon id={m.id} size={15} />
                        <div>
                          <div>{tn(m.name)}</div>
                          <div className={`small ${suspicious ? "bad-text" : "faint"}`}>
                            {suspicious ? t("公告里有写给 AI 的指令", "Notice contains instructions aimed at the AI") : m.trusted ? tn(m.category) : tn(m.description) || t("商家", "Shop")}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="faint small hide-sm">
                      {items.slice(0, 2).map((c) => `${tn(c.name)} ${money(c.price, 0)}`).join(t("，", ", "))}
                      {items.length > 2 && t(` 等 ${items.length} 项`, `, ${items.length} items`)}
                    </td>
                    <td><ExtLink href={`${addrLink(m.address)}#code`} className="mono faint">{short(m.address)}</ExtLink></td>
                    <td>{m.allowed ? <Badge tone="ok">{t("已加入", "Added")}</Badge> : <Badge tone={suspicious ? "bad" : "none"}>{t("未加入", "Not added")}</Badge>}</td>
                    {isOwner && (
                      <td className="right">
                        <button className={`btn btn-sm ${m.allowed ? "btn-danger" : ""}`} disabled={busy} onClick={() => toggle(m)}>
                          {m.allowed ? t("移出", "Remove") : t("加入", "Add")}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="panel-pad"><TxToast state={tx.state} onClose={tx.clear} /></div>
      </section>
      <Platforms />
      <PlainAddresses />
      <p className="faint small">
        {t(`这里列出的是绑定了本金库（${short(dep.contracts.AgentVault)}）的商家合约：部署配置里登记的店，以及链上白名单记录里出现过的所有店。`, `Listed: shop contracts bound to this vault (${short(dep.contracts.AgentVault)}) — those in the deployment config plus every shop that has appeared in the on-chain whitelist history.`)}
      </p>
      <Modal open={adding} onClose={() => setAdding(false)} title={isOwner ? t("添加商家", "Add shop") : t("检查商家合约", "Check a shop contract")} width={520}>
        <AddMerchant onDone={() => setAdding(false)} />
      </Modal>
      {confirmDialog}
    </div>
  );
}

/** 外部平台：不用我们的合约格式，走 UCP 风格结账 + x402 付款。白名单里登记的是平台的收款地址 */
function Platforms() {
  const isOwner = useIsOwner();
  const tx = useTx();
  const qc = useQueryClient();
  const profile = usePlatformProfile();
  const listed = useReadContracts({
    contracts: externalPlatforms.map((p) => ({ address: VAULT, abi: agentVaultAbi, functionName: "isMerchant" as const, args: [p.payTo] as const })),
    query: { refetchInterval: 8000 },
  });
  if (!externalPlatforms.length) return null;
  const h = profile.data?.payment_handlers.find((x) => x.type === "x402");
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{t("外部平台", "External platforms")}</h2>
          <span className="faint small">
            {t("不需要商家部署合约：平台遵循主流的 AI 购物协议（UCP 风格结账 + x402 付款），AI 付款到平台的收款地址。额度和审批规则照样生效，但没有链上托管，退款按平台规则。", "No shop contract needed: the platform follows mainstream agent-commerce protocols (UCP-style checkout + x402 payment) and the AI pays the platform's address. Limits and approvals still apply, but there's no on-chain escrow; refunds follow the platform's policy.")}
          </span>
        </div>
      </div>
      <div className="table-scroll">
        <table className="table">
          <thead><tr><th>{t("平台", "Platform")}</th><th className="hide-sm">{t("协议", "Protocol")}</th><th>{t("收款地址（x402 payTo）", "Pay-to address (x402)")}</th><th>{t("白名单", "Whitelist")}</th>{isOwner && <th />}</tr></thead>
          <tbody>
            {externalPlatforms.map((p, i) => {
              const allowed = listed.data?.[i]?.result === true;
              // 平台自己公布的收款地址必须和登记的一致，币种必须是 mUSDC
              const match = h && h.payTo.toLowerCase() === p.payTo.toLowerCase() && h.asset.toLowerCase() === USDC.toLowerCase();
              return (
                <tr key={p.id}>
                  <td>
                    <div>{tn(p.name)}</div>
                    <div className={`small ${profile.error ? "bad-text" : "faint"}`}>
                      {profile.error ? t("平台服务没有启动（npm run cloudeats）", "Platform service not running (npm run cloudeats)") : profile.data ? (match ? t("已核对：平台公布的收款地址与登记一致", "Verified: the platform's published address matches") : t("平台公布的收款地址与登记不一致！", "The platform's published address does NOT match!")) : t("读取中…", "Loading…")}
                    </div>
                  </td>
                  <td className="faint small hide-sm">{t(p.protocol, "UCP-style checkout + x402 payment (simulated)")}</td>
                  <td><ExtLink href={`https://sepolia.etherscan.io/token/${USDC}?a=${p.payTo}`} className="mono faint">{short(p.payTo)}</ExtLink></td>
                  <td>{allowed ? <Badge tone="ok">{t("已加入", "Added")}</Badge> : <Badge>{t("未加入", "Not added")}</Badge>}</td>
                  {isOwner && (
                    <td className="right">
                      <button
                        className={`btn btn-sm ${allowed ? "btn-danger" : ""}`}
                        disabled={tx.state.kind === "busy" || (!allowed && !match)}
                        onClick={async () => {
                          await tx.send(allowed ? `${t("移出", "Remove")} ${tn(p.name)}` : `${t("加入", "Add")} ${tn(p.name)}`, { address: VAULT, abi: agentVaultAbi, functionName: "setMerchant", args: [p.payTo, !allowed] });
                          qc.invalidateQueries();
                        }}
                      >
                        {allowed ? t("移出", "Remove") : t("加入", "Add")}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="panel-pad"><TxToast state={tx.state} onClose={tx.clear} /></div>
    </section>
  );
}

// ─────────────── 普通地址（只能转账） ───────────────

const NOTES_KEY = "agentvault.addressNotes";
function loadNotes(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(NOTES_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveNote(addr: string, note: string) {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify({ ...loadNotes(), [addr.toLowerCase()]: note }));
  } catch {
    /* 浏览器不让存就算了，备注只是本地显示用 */
  }
}

/** 白名单里既不是商家合约、也不是外部平台的地址：回放链上 MerchantSet 事件得到 */
function usePlainAddresses() {
  const client = usePublicClient();
  const merchants = useMerchants();
  return useQuery({
    queryKey: ["plain-addresses", merchants.length],
    enabled: Boolean(client),
    refetchInterval: 15000,
    queryFn: async () => {
      const logs = await client!.getContractEvents({ address: VAULT, abi: agentVaultAbi, eventName: "MerchantSet", fromBlock: dep.deployBlock });
      const state = new Map<string, boolean>();
      for (const l of logs) state.set(getAddress(l.args.merchant!), Boolean(l.args.allowed));
      const known = new Set([...merchants.map((m) => m.address.toLowerCase()), ...externalPlatforms.map((p) => p.payTo.toLowerCase())]);
      const out: { address: Address; allowed: boolean }[] = [];
      for (const [a, allowed] of state) {
        if (known.has(a.toLowerCase())) continue;
        const code = await client!.getCode({ address: a as Address });
        if (code && code !== "0x") continue; // 合约（比如旧版商家合约）不算普通地址
        out.push({ address: a as Address, allowed });
      }
      return out.sort((x, y) => Number(y.allowed) - Number(x.allowed));
    },
  });
}

function AddAddress({ onDone }: { onDone: () => void }) {
  const client = usePublicClient();
  const tx = useTx();
  const qc = useQueryClient();
  const isOwner = useIsOwner();
  const [input, setInput] = useState("");
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<"eoa" | "contract" | "loading" | null>(null);
  const addr = isAddress(input.trim(), { strict: false }) ? getAddress(input.trim().toLowerCase()) : undefined;
  const merchants = useMerchants();
  const listedElsewhere = addr && (merchants.find((m) => m.address.toLowerCase() === addr.toLowerCase())?.name ?? externalPlatforms.find((p) => p.payTo.toLowerCase() === addr.toLowerCase())?.name);

  useEffect(() => {
    setKind(null);
    if (!addr || !client) return;
    let cancel = false;
    setKind("loading");
    client.getCode({ address: addr }).then((c) => !cancel && setKind(c && c !== "0x" ? "contract" : "eoa"));
    return () => {
      cancel = true;
    };
  }, [addr, client]);

  async function add() {
    if (!addr) return;
    if (note.trim()) saveNote(addr, note.trim());
    await tx.send(t("加入白名单", "Add to whitelist"), { address: VAULT, abi: agentVaultAbi, functionName: "setMerchant", args: [addr, true] });
    qc.invalidateQueries({ queryKey: ["plain-addresses"] });
  }

  return (
    <div className="add-merchant">
      <label className="field">
        <span>{t("收款地址", "Payee address")}</span>
        <input className="input mono" value={input} onChange={(e) => setInput(e.target.value)} placeholder="0x…" data-autofocus spellCheck={false} />
      </label>
      <label className="field">
        <span>{t("备注（只存在这台电脑上）", "Note (stored on this computer only)")}</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("例如：房东、室友 AA", "e.g. landlord, roommate split")} />
      </label>
      {input && !addr && <p className="small bad-text">{t("地址格式不对", "Invalid address")}</p>}
      {listedElsewhere && <p className="small bad-text">{t(`这是「${listedElsewhere}」的地址，已经在上面的商家 / 外部平台里管理，不用再当普通地址添加。`, `This is ${tn(listedElsewhere)}'s address, already managed under shops / external platforms above.`)}</p>}
      {kind === "contract" && <p className="small bad-text">{t('这是一个合约地址。如果它是商家店铺，请在上面的"商家合约"里导入，那样才有托管和申诉。', 'This is a contract address. If it is a shop, import it under "Shop contracts" above to get escrow and disputes.')}</p>}
      <ul className="checklist">
        <CheckRow ok warn>{t("普通地址没有订单、托管和退款：钱付出去就到了对方手里，只能靠对方自己退回", "Plain addresses have no orders, escrow or refunds: once paid, the money is theirs unless they send it back")}</CheckRow>
        <CheckRow ok>{t("单笔上限、每日额度、超额审批照样生效", "Per-payment cap, daily limit and approvals still apply")}</CheckRow>
        <CheckRow ok>{t('AI 只会在你明确说"给某某转账"时才用这条通道', 'The AI only uses this when you explicitly say "send money to …"')}</CheckRow>
      </ul>
      <div className="modal-foot">
        <button className="btn" onClick={onDone}>{tx.state.kind === "ok" ? t("完成", "Done") : t("取消", "Cancel")}</button>
        <button className="btn btn-primary" disabled={!isOwner || kind !== "eoa" || Boolean(listedElsewhere) || tx.state.kind === "busy" || tx.state.kind === "ok"} onClick={add}>
          {t("加入白名单", "Add to whitelist")}
        </button>
      </div>
      {!isOwner && <p className="small muted">{t("加入白名单需要用管理员钱包连接。", "Adding to the whitelist needs the admin wallet.")}</p>}
      <TxToast state={tx.state} onClose={tx.clear} />
    </div>
  );
}

/** 普通地址：没有订单和托管，只能直接转账（比如给朋友 AA、交房租） */
function PlainAddresses() {
  const isOwner = useIsOwner();
  const tx = useTx();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [confirmDialog, confirm] = useConfirm();
  const { data = [], isLoading } = usePlainAddresses();
  const notes = loadNotes();

  async function toggle(a: { address: Address; allowed: boolean }) {
    if (a.allowed) {
      const ok = await confirm({ title: t("移出这个地址？", "Remove this address?"), body: t("移出后 AI 不能再向它转账。", "The AI won't be able to send money to it anymore."), confirm: t("移出白名单", "Remove"), danger: true });
      if (!ok) return;
    }
    await tx.send(a.allowed ? t("移出地址", "Remove address") : t("加入地址", "Add address"), { address: VAULT, abi: agentVaultAbi, functionName: "setMerchant", args: [a.address, !a.allowed] });
    qc.invalidateQueries({ queryKey: ["plain-addresses"] });
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{t("普通地址（转账）", "Plain addresses (transfers)")}</h2>
          <span className="faint small">{t("朋友、房东这类个人钱包：没有订单和托管，AI 只能直接转账。额度和审批规则照样生效。", "Personal wallets like friends or a landlord: no orders or escrow, the AI can only transfer. Limits and approvals still apply.")}</span>
        </div>
        <button className="btn" onClick={() => setAdding(true)}><Plus /> {t("添加地址", "Add address")}</button>
      </div>
      {isLoading ? (
        <div className="empty">{t("读取中…", "Loading…")}</div>
      ) : data.length === 0 ? (
        <div className="empty">{t("还没有加入普通地址", "No plain addresses yet")}</div>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>{t("地址", "Address")}</th><th>{t("备注", "Note")}</th><th>{t("白名单", "Whitelist")}</th>{isOwner && <th />}</tr></thead>
            <tbody>
              {data.map((a) => {
                const label = labelOf(a.address);
                return (
                  <tr key={a.address}>
                    <td><ExtLink href={`https://sepolia.etherscan.io/token/${USDC}?a=${a.address}`} className="mono faint">{short(a.address)}</ExtLink></td>
                    <td className="small">{notes[a.address.toLowerCase()] ?? (label !== short(a.address) ? label : <span className="faint">—</span>)}</td>
                    <td>{a.allowed ? <Badge tone="ok">{t("已加入", "Added")}</Badge> : <Badge>{t("已移出", "Removed")}</Badge>}</td>
                    {isOwner && (
                      <td className="right">
                        <button className={`btn btn-sm ${a.allowed ? "btn-danger" : ""}`} disabled={tx.state.kind === "busy"} onClick={() => toggle(a)}>
                          {a.allowed ? t("移出", "Remove") : t("加入", "Add")}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="panel-pad"><TxToast state={tx.state} onClose={tx.clear} /></div>
      <Modal open={adding} onClose={() => setAdding(false)} title={t("添加普通地址", "Add plain address")} width={480}>
        <AddAddress onDone={() => setAdding(false)} />
      </Modal>
      {confirmDialog}
    </section>
  );
}
