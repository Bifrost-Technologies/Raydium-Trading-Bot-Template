import {
  ApiClmmConfigItem,
  ApiClmmPoolsItem,
  PoolInfoLayout
} from '@raydium-io/raydium-sdk';
import {
  PublicKey,
  Connection
} from '@solana/web3.js';


import { formatConfigInfo } from './formatClmmConfigs';
import { getApiClmmPoolsItemStatisticsDefault } from './formatClmmKeys';

async function getMintProgram(mint: PublicKey, connection: Connection) {
  const account = await connection.getAccountInfo(mint)
  if (account === null) throw Error(' get id info error ')
  return account.owner
}
async function getConfigInfo(configId: PublicKey, connection: Connection): Promise<ApiClmmConfigItem> {
  const account = await connection.getAccountInfo(configId)
  if (account === null) throw Error(' get id info error ')
  return formatConfigInfo(configId, account, connection)
}

export async function formatClmmKeysById(id: string, connection: Connection): Promise<ApiClmmPoolsItem> {
  const account = await connection.getAccountInfo(new PublicKey(id))
  if (account === null) throw Error(' get id info error ')
  const info = PoolInfoLayout.decode(account.data)

  return {
    id,
    mintProgramIdA: (await getMintProgram(info.mintA, connection)).toString(),
    mintProgramIdB: (await getMintProgram(info.mintB, connection)).toString(),
    mintA: info.mintA.toString(),
    mintB: info.mintB.toString(),
    vaultA: info.vaultA.toString(),
    vaultB: info.vaultB.toString(),
    mintDecimalsA: info.mintDecimalsA,
    mintDecimalsB: info.mintDecimalsB,
    ammConfig: await getConfigInfo(info.ammConfig, connection),
    rewardInfos: await Promise.all(
      info.rewardInfos
        .filter((i) => !i.tokenMint.equals(PublicKey.default))
        .map(async (i) => ({
          mint: i.tokenMint.toString(),
          programId: (await getMintProgram(i.tokenMint, connection)).toString(),
        }))
    ),
    tvl: 0,
    day: getApiClmmPoolsItemStatisticsDefault(),
    week: getApiClmmPoolsItemStatisticsDefault(),
    month: getApiClmmPoolsItemStatisticsDefault(),
    lookupTableAccount: PublicKey.default.toBase58(),
  }
}
