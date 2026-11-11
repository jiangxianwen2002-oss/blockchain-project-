// 链上对账：钱现在在哪里。浏览器直接向以太坊公共节点读取，不经过任何后端；每一行都能去 Etherscan 核对
import { useBlockNumber } from "wagmi";
import { CheckCircle2, XCircle } from "lucide-react";
import { allShops, dep, EXPLORER, short, USDC, VAULT } from "../../config";
import { useActivity, useLedger } from "../../hooks";
import { ShopIcon } from "../../shared/OrderTicket";
import { ExtLink, money } from "../../shared/ui";
import { t, tn } from "../../i18n";

const tokenPage = (a: string) => `${EXPLORER}/token/${USDC}?a=${a}`;

function Check({ ok, children }: { ok: boolean | undefined; children: React.ReactNode }) {
  if (ok === undefined) return <span className="faint">—</span>;
  return (
    <span className={`check-cell ${ok ? "ok" : "bad"}`}>
      {ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
      {children}
    </span>
  );
}

export function Ledger() {
  const { bal, shops, platforms, plain, merchantReceived } = useLedger();
  const { data: block } = useBlockNumber({ watch: true, query: { refetchInterval: 12000 } });
  const { data: events } = useActivity();
  const vault = bal.get("vault");
  const merchant = merchantReceived;
  const attacker = bal.get("attacker");
  const parts = [vault, merchant, ...shops.map((s) => s.balance), ...platforms.map((p) => p.balance), ...plain.map((p) => p.balance)];
  const total = parts.every((x) => x !== undefined) ? parts.reduce((s, x) => s! + x!, 0n) : undefined;
  const vaultEvents = (events ?? []).filter((e) => !e.shop);
  const sum = (name: string) =>
    vaultEvents.filter((e) => e.eventName === name).reduce((s, e) => s + ((e.args as { amount?: bigint }).amount ?? 0n), 0n);
  const net = events ? sum("Deposited") - sum("Withdrawn") : undefined;

  return (
    <div className="stack">
      <div className="checks">
        <div className="check-card">
          <span className="stat-label">{t("资金守恒", "Funds conserved")}</span>
          <Check ok={total !== undefined && net !== undefined ? total === net : undefined}>
            {money(total)} = {t("存入", "deposits")} {money(events ? sum("Deposited") : undefined)} − {t("取出", "withdrawals")} {money(events ? sum("Withdrawn") : undefined)}
          </Check>
        </div>
        <div className="check-card">
          <span className="stat-label">{t("商家合约账本", "Shop contract books")}</span>
          <Check ok={shops.every((s) => s.balance !== undefined) ? shops.every((s) => s.balance === (s.escrowed ?? 0n) + (s.withdrawable ?? 0n)) : undefined}>
            {t("余额 = 托管 + 可提现", "Balance = escrow + withdrawable")}
          </Check>
        </div>
        <div className="check-card">
          <span className="stat-label">{t("攻击者", "Attacker")}</span>
          <Check ok={attacker === undefined ? undefined : attacker === 0n}>{t("收到", "Received")} {money(attacker)}</Check>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>{t("余额", "Balances")}</h2>
          <span className="faint small">{t("区块", "Block")} #{block?.toString() ?? "…"} · {t("浏览器直接读取链上数据", "read straight from the chain by your browser")}</span>
        </div>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr><th>{t("地址", "Address")}</th><th className="right">{t("余额", "Balance")}</th><th className="right hide-sm">{t("托管中", "In escrow")}</th><th className="right hide-sm">{t("可提现", "Withdrawable")}</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><ExtLink href={tokenPage(VAULT)} className="">{t("钱包（金库合约）", "Wallet (vault contract)")}</ExtLink> <span className="mono faint">{short(VAULT)}</span></td>
                <td className="right num"><strong>{money(vault)}</strong></td>
                <td className="right faint hide-sm">—</td>
                <td className="right faint hide-sm">—</td>
              </tr>
              {shops.map(({ shop, balance, escrowed, withdrawable }) => (
                <tr key={shop.id}>
                  <td>
                    <span className="cell-shop">
                      <ShopIcon id={shop.id} size={14} />
                      <ExtLink href={tokenPage(shop.address)} className={shop.trusted ? "" : "bad-text"}>{tn(shop.name)}</ExtLink>
                      <span className="mono faint">{short(shop.address)}</span>
                    </span>
                  </td>
                  <td className="right num"><strong>{money(balance)}</strong></td>
                  <td className="right num hide-sm">{money(escrowed)}</td>
                  <td className="right num hide-sm">{money(withdrawable)}</td>
                </tr>
              ))}
              <tr>
                <td><ExtLink href={tokenPage(dep.roles.merchant)} className="">{t("商家钱包（从本环境商家合约提现）", "Merchant wallet (withdrawn from these shops)")}</ExtLink> <span className="mono faint">{short(dep.roles.merchant)}</span></td>
                <td className="right num"><strong>{money(merchant)}</strong></td>
                <td className="right faint hide-sm">—</td>
                <td className="right faint hide-sm">—</td>
              </tr>
              {platforms.map(({ platform, balance }) => (
                <tr key={platform.id}>
                  <td><ExtLink href={tokenPage(platform.payTo)} className="">{tn(platform.name)}{t("（外部平台，净收款）", " (external platform, net received)")}</ExtLink> <span className="mono faint">{short(platform.payTo)}</span></td>
                  <td className="right num"><strong>{money(balance)}</strong></td>
                  <td className="right faint hide-sm">—</td>
                  <td className="right faint hide-sm">—</td>
                </tr>
              ))}
              {plain.map(({ address, balance }) => (
                <tr key={address}>
                  <td><ExtLink href={tokenPage(address)} className="">{t("普通地址（净收款）", "Plain address (net received)")}</ExtLink> <span className="mono faint">{short(address)}</span></td>
                  <td className="right num"><strong>{money(balance)}</strong></td>
                  <td className="right faint hide-sm">—</td>
                  <td className="right faint hide-sm">—</td>
                </tr>
              ))}
              <tr>
                <td><ExtLink href={tokenPage(dep.attacker)} className="bad-text">{t("攻击者地址", "Attacker address")}</ExtLink> <span className="mono faint">{short(dep.attacker)}</span></td>
                <td className="right num"><strong>{money(attacker)}</strong></td>
                <td className="right faint hide-sm">—</td>
                <td className="right faint hide-sm">—</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td className="muted">{t("合计（钱包 + 商家合约 + 商家钱包 + 外部平台 + 普通地址）", "Total (wallet + shop contracts + merchant wallet + external platforms + plain addresses)")}</td>
                <td className="right num"><strong>{money(total)}</strong></td>
                <td className="hide-sm" />
                <td className="hide-sm" />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      <p className="faint small">
        {t(`付款、退款、放款、提现只是在这些地址之间移动，合计不变。点任意地址可以在 Etherscan 查看它的全部 mUSDC 转账；共 ${allShops.length} 个商家合约，均已验证源码。`, `Payments, refunds, releases and withdrawals only move money between these addresses, so the total stays the same. Click any address to see all its mUSDC transfers on Etherscan; all ${allShops.length} shop contracts have verified source code.`)}
      </p>
    </div>
  );
}
