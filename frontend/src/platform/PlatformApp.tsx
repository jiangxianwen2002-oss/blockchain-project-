// 平台方：仲裁买家的申诉。仲裁人地址写死在官方工厂里，每家通过工厂开的店都绑定它。
// 合约限制了仲裁人的权力：只能处理"申诉中"的订单，只能在"退款给买家"和"放款给商家"之间二选一，动不了别的钱。
import { useQuery } from "@tanstack/react-query";
import { useConnect, useConnection, useConnectors, useDisconnect, usePublicClient, useReadContracts } from "wagmi";
import { parseAbiItem, type Address } from "viem";
import { Check, Gavel, RotateCcw, Scale, Wallet, X } from "lucide-react";
import { agentShopAbi, shopFactoryAbi } from "../generated/abi";
import { dep, FACTORY, short } from "../config";
import { useOrders, useShops, useTx } from "../hooks";
import { OrderTicket } from "../shared/OrderTicket";
import { Badge, ExtLink, addrLink, money, txLink, TxToast } from "../shared/ui";
import { useConfirm } from "../console/Dialog";
import { LangToggle, locale, t, tn } from "../i18n";

const FROM = BigInt((dep as { shopsDeployBlock?: number }).shopsDeployBlock ?? dep.deployBlock);

/** 官方工厂开过的所有店 */
function useFactoryShops() {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["factory-shops"],
    enabled: Boolean(client),
    refetchInterval: 30000,
    queryFn: async () => {
      const logs = await client!.getContractEvents({ address: FACTORY, abi: shopFactoryAbi, eventName: "ShopCreated", fromBlock: FROM });
      return logs.map((l) => ({ shop: l.args.shop as Address, owner: l.args.owner as Address, name: l.args.name as string }));
    },
  });
}

/** 仲裁记录：所有工厂店的 DisputeResolved 事件 */
function useHistory(shops: Address[]) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["arbitrations", shops.length],
    enabled: Boolean(client && shops.length),
    refetchInterval: 15000,
    queryFn: async () => {
      const logs = await client!.getLogs({ address: shops, event: parseAbiItem("event DisputeResolved(uint256 indexed orderId, bool refunded)"), fromBlock: FROM });
      return logs.map((l) => ({ shop: l.address, orderId: l.args.orderId!, refunded: l.args.refunded!, tx: l.transactionHash!, block: l.blockNumber! })).reverse();
    },
  });
}

export function PlatformApp() {
  const { address, isConnected } = useConnection();
  const connectors = useConnectors();
  const { mutate: connect } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const tx = useTx();
  const [dialog, confirm] = useConfirm();
  const shops = useShops();
  const orders = useOrders();
  const factoryShops = useFactoryShops().data ?? [];
  const official = new Set(factoryShops.map((s) => s.shop.toLowerCase()));
  const rules = useReadContracts({
    contracts: [
      { address: FACTORY, abi: shopFactoryAbi, functionName: "arbiter" },
      { address: FACTORY, abi: shopFactoryAbi, functionName: "minConfirmWindow" },
    ],
  });
  const arbiter = rules.data?.[0]?.result as Address | undefined;
  const isArbiter = Boolean(address && arbiter && address.toLowerCase() === arbiter.toLowerCase());
  const history = useHistory(factoryShops.map((s) => s.shop)).data ?? [];
  const disputes = orders.filter((o) => o.status === "Disputed" && official.has(o.shop.address.toLowerCase()));
  const nameOf = (a: string) => shops.find((s) => s.address.toLowerCase() === a.toLowerCase())?.name ?? factoryShops.find((s) => s.shop.toLowerCase() === a.toLowerCase())?.name ?? short(a);

  async function resolve(o: (typeof disputes)[number], refund: boolean) {
    const ok = await confirm({
      title: refund ? t(`退款 ${money(o.total)} 给买家？`, `Refund ${money(o.total)} to the buyer?`) : t(`放款 ${money(o.total)} 给商家？`, `Release ${money(o.total)} to the shop?`),
      body: refund
        ? t(`「${o.shop.name}」订单 #${o.id}：托管里的钱原路退回买家的金库。裁决记录在链上，不能撤销。`, `${tn(o.shop.name)} order #${o.id}: the escrowed money goes back to the buyer's vault. The ruling is recorded on-chain and can't be undone.`)
        : t(`「${o.shop.name}」订单 #${o.id}：托管里的钱放给商家，商家可以提现。裁决记录在链上，不能撤销。`, `${tn(o.shop.name)} order #${o.id}: the escrowed money is released to the shop, which can withdraw it. The ruling is recorded on-chain and can't be undone.`),
      confirm: refund ? t("退款给买家", "Refund buyer") : t("放款给商家", "Release to shop"),
      danger: !refund,
    });
    if (!ok) return;
    await tx.send(refund ? t("仲裁：退款", "Ruling: refund") : t("仲裁：放款", "Ruling: release"), { address: o.shop.address, abi: agentShopAbi, functionName: "resolveDispute", args: [o.id, refund] });
  }

  return (
    <div className="merchant">
      <header className="top">
        <h1><Scale size={18} /> {t("平台仲裁", "Platform arbitration")}</h1>
        <div className="top-right">
          <LangToggle />
          {isConnected && (isArbiter ? <Badge tone="ok">{t("仲裁人", "Arbiter")}</Badge> : <Badge>{t("不是仲裁人", "Not the arbiter")}</Badge>)}
          <button className="btn btn-sm" onClick={() => (isConnected ? disconnect() : connectors[0] && connect({ connector: connectors[0] }))}>
            <Wallet size={14} /> {isConnected && address ? short(address) : t("连接钱包", "Connect wallet")}
          </button>
        </div>
      </header>

      <div className="page stack narrow">
        <section className="panel panel-pad">
          <h2>{t("仲裁人能做什么（由合约限制）", "What the arbiter can do (enforced by the contract)")}</h2>
          <ul className="checklist">
            <li className="ok"><Check size={15} /><span>{t("只处理买家申诉、钱冻结在托管里的订单", "Only orders the buyer disputed, with money frozen in escrow")}</span></li>
            <li className="ok"><Check size={15} /><span>{t("只能二选一：退款给买家的金库，或放款给商家", "Only one of two choices: refund the buyer's vault, or release to the shop")}</span></li>
            <li className="bad"><X size={15} /><span>{t("动不了金库、商家余额和其他任何订单，也改不了价格和规则", "Can't touch the vault, shop balances or any other order, and can't change prices or rules")}</span></li>
          </ul>
          <dl className="kv flush">
            <div><dt>{t("仲裁人", "Arbiter")}</dt><dd>{arbiter ? <ExtLink href={addrLink(arbiter)} className="mono">{short(arbiter)}</ExtLink> : "—"}</dd></div>
            <div><dt>{t("官方工厂", "Official factory")}</dt><dd><ExtLink href={`${addrLink(FACTORY)}#code`} className="mono">{short(FACTORY)}</ExtLink></dd></div>
            <div><dt>{t("受理范围", "Covers")}</dt><dd>{t(`工厂开的 ${factoryShops.length} 家店`, `${factoryShops.length} factory shops`)}</dd></div>
          </dl>
        </section>

        <section className="stack">
          <div className="panel-head flush" style={{ padding: 0 }}>
            <h2><Gavel size={15} /> {t("待处理的申诉", "Open disputes")}</h2>
            <span className="faint small">{disputes.length}</span>
          </div>
          {disputes.length === 0 ? (
            <div className="panel empty">{t("没有申诉中的订单", "No disputed orders")}</div>
          ) : (
            disputes.map((o) => (
              <div key={`${o.shop.address}-${o.id}`} className="stack" style={{ gap: 6 }}>
                <OrderTicket
                  shop={o.shop}
                  id={o.id}
                  actions={
                    <div className="btn-row">
                      <button className="btn btn-sm" disabled={!isArbiter || tx.state.kind === "busy"} onClick={() => resolve(o, true)}>
                        <RotateCcw size={14} /> {t("退款给买家", "Refund buyer")}
                      </button>
                      <button className="btn btn-sm" disabled={!isArbiter || tx.state.kind === "busy"} onClick={() => resolve(o, false)}>
                        {t("放款给商家", "Release to shop")}
                      </button>
                    </div>
                  }
                />
                <p className="faint small">
                  {t("送达时间", "Delivered")} {new Date(o.deliveredAt * 1000).toLocaleString(locale)} · {t("下单的 AI 代理", "ordering AI agent")} <ExtLink href={addrLink(o.buyer)} className="mono">{short(o.buyer)}</ExtLink>{t('。展开"链上凭证"可以看到下单、付款、送达、申诉的每一笔交易。', '. Expand "On-chain proof" to see every transaction: order, payment, delivery, dispute.')}
                </p>
              </div>
            ))
          )}
          {!isArbiter && disputes.length > 0 && (
            <p className="small muted">{t("裁决需要用仲裁人钱包连接（演示前把平台仲裁人的测试钱包导入 MetaMask）。也可以用命令行：", "Rulings need the arbiter wallet (import the platform arbiter's test wallet into MetaMask before the demo). Or use the CLI: ")}npm run platform -- resolve &lt;order&gt; refund|release</p>
          )}
          <TxToast state={tx.state} onClose={tx.clear} />
        </section>

        <section className="panel">
          <div className="panel-head"><h2>{t("仲裁记录", "Ruling history")}</h2></div>
          {history.length === 0 ? (
            <div className="empty">{t("还没有仲裁记录", "No rulings yet")}</div>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead><tr><th>{t("店铺", "Shop")}</th><th>{t("订单", "Order")}</th><th>{t("裁决", "Ruling")}</th><th>{t("交易", "Tx")}</th></tr></thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.tx}>
                      <td>{tn(nameOf(h.shop))}</td>
                      <td className="num">#{h.orderId.toString()}</td>
                      <td>{h.refunded ? <Badge tone="none">{t("退款给买家", "Refunded buyer")}</Badge> : <Badge tone="ok">{t("放款给商家", "Released to shop")}</Badge>}</td>
                      <td><ExtLink href={txLink(h.tx)} className="mono faint">#{h.block.toString()}</ExtLink></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      {dialog}
    </div>
  );
}
