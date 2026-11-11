import { useState } from "react";
import { useConnection } from "wagmi";
import { maxUint256 } from "viem";
import { agentVaultAbi, mockUsdcAbi } from "../../generated/abi";
import { toUnits, USDC, VAULT } from "../../config";
import { useIsOwner, useTx, useUsdc, useVault } from "../../hooks";
import { ExtLink, addrLink, money, TxToast } from "../../shared/ui";
import { useConfirm } from "../Dialog";
import { t } from "../../i18n";

export function Funds() {
  const { address, isConnected } = useConnection();
  const { balance, paused } = useVault();
  const wallet = useUsdc(address);
  const isOwner = useIsOwner();
  const tx = useTx();
  const [amount, setAmount] = useState("100");
  const [confirmDialog, confirm] = useConfirm();
  const units = (() => {
    try {
      return toUnits(amount);
    } catch {
      return 0n;
    }
  })();
  const needsApprove = (wallet.allowance ?? 0n) < units;
  const v = { address: VAULT, abi: agentVaultAbi } as const;
  const busy = tx.state.kind === "busy";

  return (
    <div className="stack narrow">
      <section className="panel panel-pad">
        <span className="stat-label">{t("钱包余额（金库合约）", "Wallet balance (vault contract)")}</span>
        <div className="hero num">
          {money(balance)} <small>mUSDC</small>
        </div>
        <ExtLink href={addrLink(VAULT)} className="faint small">{t("金库合约", "Vault contract")}</ExtLink>
      </section>

      <section className="panel panel-pad">
        <div className="panel-head flush">
          <h2>{t("存入 / 取出", "Deposit / withdraw")}</h2>
          {isConnected && <span className="faint small num">{t("我的钱包", "My wallet")} {money(wallet.balance)} mUSDC</span>}
        </div>
        {!isConnected ? (
          <p className="muted">{t("连接钱包后可以存入；只有管理员可以取出。", "Connect a wallet to deposit. Only the admin can withdraw.")}</p>
        ) : (
          <>
            <div className="amount-row">
              <input className="input num" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
              <span className="faint">mUSDC</span>
            </div>
            <div className="btn-row">
              {needsApprove ? (
                <button className="btn btn-primary" disabled={busy || units === 0n} onClick={() => tx.send(t("授权", "Approve"), { address: USDC, abi: mockUsdcAbi, functionName: "approve", args: [VAULT, maxUint256] })}>
                  {t("授权金库使用 mUSDC", "Allow the vault to use mUSDC")}
                </button>
              ) : (
                <button className="btn btn-primary" disabled={busy || units === 0n} onClick={() => tx.send(t("存入", "Deposit"), { ...v, functionName: "deposit", args: [units] })}>
                  {t("存入", "Deposit")}
                </button>
              )}
              {isOwner && (
                <button
                  className="btn"
                  disabled={busy || units === 0n}
                  onClick={async () =>
                    (await confirm({
                      title: t(`取出 ${money(units)} mUSDC？`, `Withdraw ${money(units)} mUSDC?`),
                      body: t(`钱会从金库转到你当前连接的钱包 ${address?.slice(0, 6)}…${address?.slice(-4)}。AI 可用的余额会相应减少。`, `The money moves from the vault to your connected wallet ${address?.slice(0, 6)}…${address?.slice(-4)}. The AI will have less to spend.`),
                      confirm: t("确认取出", "Withdraw"),
                    })) && tx.send(t("取出", "Withdraw"), { ...v, functionName: "withdraw", args: [address!, units] })
                  }
                >
                  {t("取出到我的钱包", "Withdraw to my wallet")}
                </button>
              )}
            </div>
            {paused && isOwner && <p className="faint small">{t("冻结期间仍然可以取出。", "You can still withdraw while frozen.")}</p>}
          </>
        )}
        <TxToast state={tx.state} onClose={tx.clear} />
      </section>
      {confirmDialog}
    </div>
  );
}
