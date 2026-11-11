// 自用小钱包：超额的付款直接在聊天里确认。
// 签名的仍然是你 MetaMask 里的主人钥匙（AI 拿不到），合约照样检查"是不是主人"——只是不用切到控制台。
import { useChainId, useConnect, useConnection, useConnectors, useReadContract, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import { Loader2, Wallet } from "lucide-react";
import { agentVaultAbi } from "../generated/abi";
import { VAULT } from "../config";
import { useIsOwner, useTx, useVault } from "../hooks";
import { t } from "../i18n";

export function ApproveBar({ requestId, onResult }: { requestId: bigint; onResult: (r: "approved" | "rejected", url?: string) => void }) {
  const { isConnected } = useConnection();
  const chainId = useChainId();
  const connectors = useConnectors();
  const { mutate: connect, isPending: connecting } = useConnect();
  const { mutate: switchChain } = useSwitchChain();
  const isOwner = useIsOwner();
  const { paused } = useVault();
  const tx = useTx();
  const busy = tx.state.kind === "busy";
  const v = { address: VAULT, abi: agentVaultAbi } as const;
  // 请求可能已经在控制台或别的设备上处理过了：不是"待处理"就不再显示按钮
  const req = useReadContract({ ...v, functionName: "getRequest", args: [requestId], query: { refetchInterval: 5000 } }).data as
    | { status: number }
    | undefined;

  async function decide(approve: boolean) {
    const ok = await tx.send(approve ? t("批准", "Approve") : t("拒绝", "Reject"), { ...v, functionName: approve ? "approveRequest" : "rejectRequest", args: [requestId] });
    if (ok) onResult(approve ? "approved" : "rejected");
  }

  if (req && req.status !== 1 && tx.state.kind !== "busy") return null;

  let body;
  if (!isConnected)
    body = (
      <button className="btn btn-sm btn-primary" disabled={connecting} onClick={() => connectors[0] && connect({ connector: connectors[0] })}>
        <Wallet /> {t("连接钱包确认", "Connect wallet to approve")}
      </button>
    );
  else if (chainId !== sepolia.id)
    body = <button className="btn btn-sm" onClick={() => switchChain({ chainId: sepolia.id })}>{t("切换到 Sepolia", "Switch to Sepolia")}</button>;
  else if (!isOwner) body = <span className="faint small">{t("当前钱包不是这个小钱包的主人，不能确认", "This wallet is not the vault owner and cannot approve")}</span>;
  else
    body = (
      <>
        <button className="btn btn-sm" disabled={busy} onClick={() => decide(false)}>{t("拒绝", "Reject")}</button>
        <button className="btn btn-sm btn-primary" disabled={busy || paused} title={paused ? t("钱包已冻结", "Wallet is frozen") : ""} onClick={() => decide(true)}>
          {busy ? <Loader2 className="spin" /> : null}
          {busy ? t("请在钱包中确认", "Confirm in your wallet") : t("批准并付款", "Approve & pay")}
        </button>
      </>
    );

  return (
    <div className="approve-bar">
      <div className="approve-row">{body}</div>
      {tx.state.kind === "err" && <span className="approve-err">{tx.state.msg}</span>}
    </div>
  );
}
