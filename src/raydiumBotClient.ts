import {
  Connection,
  Keypair,
  PublicKey,
  GetProgramAccountsFilter,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram,
} from '@solana/web3.js'
import { getOrCreateAssociatedTokenAccount, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token'

import bs58 from 'bs58'

import {
  ApiClmmPoolsItem,
  Clmm,
  TradeV2,
  Currency,
  CurrencyAmount,
  Percent,
  Token,
  TokenAmount,
  fetchMultipleMintInfos,
  publicKey,
  MAINNET_PROGRAM_ID,
} from '@raydium-io/raydium-sdk'

import { DEFAULT_TOKEN, makeTxVersion, PROGRAMIDS } from '../config'
import { formatAmmKeysById } from './formatAmmKeysById'
import { buildAndSendTx, getWalletTokenAccount } from './util'
import { formatClmmKeys } from './formatClmmKeys'
import BN from 'bn.js'

type WalletTokenAccounts = Awaited<ReturnType<typeof getWalletTokenAccount>>
type TxInputInfo = {
  inputToken: Token | Currency
  outputToken: Token | Currency
  inputTokenAmount: TokenAmount | CurrencyAmount
  slippage: Percent
  walletTokenAccounts: WalletTokenAccounts
  wallet: Keypair

  feeConfig?: {
    feeBps: BN
    feeAccount: PublicKey
  }
}
export enum CurrencyType {
  SOL,
  USDC,
}
export enum TradeSide {
  Buy,
  Sell,
}
export async function TradeToken(
  rpcProvider: string,
  botWallet: Keypair,
  amount: number,
  tokenAddress: string,
  poolAddress: string,
  tokenDecimals: 9,
  currencyType: CurrencyType,
  tradeSide: TradeSide
) {
  const SolClient = new Connection(rpcProvider)
  const BotAddress = botWallet.publicKey
  const TokenAddress = new PublicKey(tokenAddress)
  const TargetToken = new Token(TOKEN_PROGRAM_ID, TokenAddress, tokenDecimals)
  const buyOrderSOLAmount = new CurrencyAmount(DEFAULT_TOKEN.SOL, amount, false)
  const buyOrderUSDCAmount = new CurrencyAmount(DEFAULT_TOKEN.USDC, amount, false)
  const sellOrderTokenAmount = new TokenAmount(TargetToken, amount, false)
  const slippage = new Percent(1, 100)
  const botTokenAccounts = await getWalletTokenAccount(SolClient, BotAddress)
  await delay(1000)

  console.log('Amount: ' + amount)

  try {
    console.log('Attempting Trade....')
    if (tradeSide == TradeSide.Buy) {
      if (currencyType == CurrencyType.USDC) {
        await Trade(SolClient, poolAddress, {
          outputToken: TargetToken,
          inputToken: DEFAULT_TOKEN.SOL,
          inputTokenAmount: buyOrderUSDCAmount,
          slippage,
          walletTokenAccounts: botTokenAccounts,
          wallet: botWallet,
        }).then(({ txids }) => {
          console.log('txids', txids)
        })
      }
      if (currencyType == CurrencyType.SOL) {
        await Trade(SolClient, poolAddress, {
          outputToken: TargetToken,
          inputToken: DEFAULT_TOKEN.SOL,
          inputTokenAmount: buyOrderSOLAmount,
          slippage,
          walletTokenAccounts: botTokenAccounts,
          wallet: botWallet,
        }).then(({ txids }) => {
          console.log('txids', txids)
        })
      }
    }
    if (tradeSide == TradeSide.Sell) {
      if (currencyType == CurrencyType.SOL) {
        await Trade(SolClient, poolAddress, {
          outputToken: DEFAULT_TOKEN.SOL,
          inputToken: TargetToken,
          inputTokenAmount: sellOrderTokenAmount,
          slippage,
          walletTokenAccounts: botTokenAccounts,
          wallet: botWallet,
        }).then(({ txids }) => {
          console.log('txids', txids)
        })
      }
      if (currencyType == CurrencyType.USDC) {
        await Trade(SolClient, poolAddress, {
          outputToken: DEFAULT_TOKEN.USDC,
          inputToken: TargetToken,
          inputTokenAmount: sellOrderTokenAmount,
          slippage,
          walletTokenAccounts: botTokenAccounts,
          wallet: botWallet,
        }).then(({ txids }) => {
          console.log('txids', txids)
        })
      }
      await delay(1000)
    }
  } catch (e) {
    console.log(e)
  }
}
export async function Trade(connect: Connection, Pool: string, input: TxInputInfo) {
  try {
    const targetPool = Pool
    const targetPoolInfo = {
      official: [],
      unOfficial: [await formatAmmKeysById(targetPool, connect)],
    }
    //const targetPoolInfo = formatAmmKeysToApi(MAINNET_PROGRAM_ID.AmmV4.toString(), connect, false)
    // If the Liquidity pool is not required for routing, then this variable can be configured as undefined
    console.log('Collected AMM Key info..')
    // -------- step 1: get all route --------
    const getRoute = TradeV2.getAllRoute({
      inputMint: input.inputToken instanceof Token ? input.inputToken.mint : PublicKey.default,
      outputMint: input.outputToken instanceof Token ? input.outputToken.mint : PublicKey.default,
      clmmList: undefined,
      apiPoolList: await targetPoolInfo,
    })
    console.log('Route retrieved!')
    // -------- step 2: fetch tick array and pool info --------
    const [tickCache, poolInfosCache] = await Promise.all([
      await Clmm.fetchMultiplePoolTickArrays({
        connection: connect,
        poolKeys: getRoute.needTickArray,
        batchRequest: true,
      }),
      await TradeV2.fetchMultipleInfo({ connection: connect, pools: getRoute.needSimulate, batchRequest: true }),
    ])
    console.log('Collected pool info!')
    // -------- step 3: calculation result of all route --------
    const [routeInfo] = TradeV2.getAllRouteComputeAmountOut({
      directPath: getRoute.directPath,
      routePathDict: getRoute.routePathDict,
      simulateCache: poolInfosCache,
      tickCache,
      inputTokenAmount: input.inputTokenAmount,
      outputToken: input.outputToken,
      slippage: input.slippage,
      chainTime: new Date().getTime() / 1000, // this chain time

      feeConfig: input.feeConfig,

      mintInfos: await fetchMultipleMintInfos({
        connection: connect,
        mints: [],
      }),

      epochInfo: await connect.getEpochInfo(),
    })
    console.log('creating swap transaction...')
    // -------- step 4: create instructions by SDK function --------
    const { innerTransactions } = await TradeV2.makeSwapInstructionSimple({
      routeProgram: PROGRAMIDS.Router,
      connection: connect,
      swapInfo: routeInfo,
      ownerInfo: {
        wallet: input.wallet.publicKey,
        tokenAccounts: input.walletTokenAccounts,
        associatedOnly: true,
        checkCreateATAOwner: true,
      },
      computeBudgetConfig: {
        units: 60000,
        microLamports: 3,
      },
      makeTxVersion,
    })
    console.log('Attempting to send transaction...')
    return {
      txids: await buildAndSendTx(input.wallet, connect, innerTransactions, {
        skipPreflight: false,
        maxRetries: 3,
        preflightCommitment: 'confirmed',
      }),
    }
  } catch (error) {
    console.log(error)
    const txids: string[] = []

    return {
      txids: txids,
    }
  }
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function getUSDCbalance(wallet: Keypair, solanaConnection: Connection) {
  var TokenBalance = 0
  try {
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      solanaConnection,
      wallet,
      new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
      wallet.publicKey
    )

    var balance = await solanaConnection.getTokenAccountBalance(tokenAccount.address)
    if (balance.value.uiAmount != null) {
      TokenBalance = balance.value.uiAmount
      return TokenBalance
    }
  } catch (error) {
    //error is thrown when no token account exists. The error will go away after you purchase the token for the first time
    console.log('Token Account may not exist yet - Error Message: ' + error)
  }
  return TokenBalance
}
