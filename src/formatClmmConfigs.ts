import {
  AmmConfigLayout,
  ApiClmmConfigItem
} from '@raydium-io/raydium-sdk';
import {
  AccountInfo,
  PublicKey,
  Connection
} from '@solana/web3.js';


export function formatConfigInfo(id: PublicKey, account: AccountInfo<Buffer>, connection: Connection): ApiClmmConfigItem {
  const info = AmmConfigLayout.decode(account.data)

  return {
    id: id.toBase58(),
    index: info.index,
    protocolFeeRate: info.protocolFeeRate,
    tradeFeeRate: info.tradeFeeRate,
    tickSpacing: info.tickSpacing,
    fundFeeRate: info.fundFeeRate,
    fundOwner: info.fundOwner.toString(),
    description: '',
  }
}

export async function formatClmmConfigs(programId: string, connection: Connection) {
  const configAccountInfo = await connection.getProgramAccounts(new PublicKey(programId), { filters: [{ dataSize: AmmConfigLayout.span }] })
  return configAccountInfo.map(i => formatConfigInfo(i.pubkey, i.account, connection)).reduce((a, b) => { a[b.id] = b; return a }, {} as { [id: string]: ApiClmmConfigItem })
}
