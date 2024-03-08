import { Connection, Keypair, PublicKey, GetProgramAccountsFilter, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";

import bs58 from "bs58"

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
} from '@raydium-io/raydium-sdk';

import {
    DEFAULT_TOKEN,
    makeTxVersion,
    PROGRAMIDS,
} from '../config';
import { formatAmmKeysById } from './formatAmmKeysById';
import {
    buildAndSendTx,
    getWalletTokenAccount,
} from './util';
import { formatClmmKeys } from "./formatClmmKeys";
import BN from "bn.js";

type WalletTokenAccounts = Awaited<ReturnType<typeof getWalletTokenAccount>>
type TxInputInfo = {
    inputToken: Token | Currency
    outputToken: Token | Currency
    inputTokenAmount: TokenAmount | CurrencyAmount
    slippage: Percent
    walletTokenAccounts: WalletTokenAccounts
    wallet: Keypair

    feeConfig?: {
        feeBps: BN,
        feeAccount: PublicKey
    }
}
export enum BuyType{
    SOL,
    USDC
}
export enum TradeSide{
    Buy,
    Sell
}
export async function TradeToken(rpcProvider: string, botWallet: Keypair, tokenAddress: string, poolAddress: string, tokenSymbol: string, tokenDecimals: 9, buyType: BuyType, tradeSide: TradeSide)
{
    const SolClient = new Connection(rpcProvider);
    const BotAddress = botWallet.publicKey;
    const TokenAddress = new PublicKey(tokenAddress);
    const PoolAddress = new PublicKey(poolAddress);
    const TargetToken = new Token(TOKEN_PROGRAM_ID, TokenAddress, tokenDecimals, tokenSymbol, tokenSymbol);

    const SolBalance = await SolClient.getBalance(BotAddress) / LAMPORTS_PER_SOL;
    const USDCbalance = await getUSDCbalance(botWallet, SolClient);
    await delay(1000);
    //Retrieve token balance of our target token
    var TokenBalance = 0;
    const tokenAccount = await getOrCreateAssociatedTokenAccount(SolClient, botWallet, TokenAddress, BotAddress);
    try {
        var balance = await SolClient.getTokenAccountBalance(tokenAccount.address);
        if (balance.value.uiAmount != null) {
            TokenBalance = balance.value.uiAmount;
        }
    } catch (error) {
      //error is thrown when no token account exists. The error will go away after you purchase the token for the first time
        console.log(error);

    }

    console.log('SOL Balance: ' + SolBalance);
    console.log('USDC Balance: ' + USDCbalance);
    console.log('Token Balance: ' + TokenBalance);

    //Change buy amount to what ever you want
    var solbuyamount = SolBalance / 5;
    var usdcbuyamount = USDCbalance / 5;
    const buyOrderSOLAmount = new CurrencyAmount(DEFAULT_TOKEN.SOL, solbuyamount, false);
    const buyOrderUSDCAmount = new TokenAmount(DEFAULT_TOKEN.USDC, usdcbuyamount, false);
    const sellOrderTokenAmount = new TokenAmount(TargetToken, TokenBalance)
    const slippage = new Percent(1, 100);
    const botTokenAccounts = await getWalletTokenAccount(SolClient, BotAddress);  
    await delay(1000);
 
    console.log("Attempting to buy token...");
    console.log("BuyOrder SOL Amount: " + buyOrderSOLAmount.raw);
    console.log("BuyOrder USDC Amount: " + buyOrderSOLAmount.raw);
    console.log("SellOrder Token Amount: "+ sellOrderTokenAmount.raw);

    try
    {
            console.log("Attempting Trade....");
            if(tradeSide == TradeSide.Buy){

            
            if(buyType == BuyType.SOL){

            await Trade(SolClient, PoolAddress.toBase58(), {
                outputToken: TargetToken,
                inputToken: DEFAULT_TOKEN.SOL,
                inputTokenAmount: buyOrderSOLAmount,
                slippage,
                walletTokenAccounts: botTokenAccounts,
                wallet: botWallet,
            }).then(({ txids }) => {
                console.log('txids', txids);
            })
            }
            //USDC version of the trade. Make sure to switch pool address to USDC raydium pool
            if(buyType == BuyType.USDC){

            
            await Trade(SolClient, PoolAddress.toBase58(), {
              outputToken: TargetToken,
              inputToken: DEFAULT_TOKEN.USDC,
              inputTokenAmount: buyOrderUSDCAmount,
              slippage,
              walletTokenAccounts: botTokenAccounts,
              wallet: botWallet,
          }).then(({ txids }) => {
             console.log('txids', txids)
          })
        }
    }
    if(tradeSide == TradeSide.Sell){
        //Bot dumps all the tokens it has
        await Trade(SolClient, PoolAddress.toBase58(), {
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
        await delay(2000);
       
      
    }  
    catch(e)
    {
      console.log(e);
    }
     
}
export async function Trade(connect: Connection, Pool: string, input: TxInputInfo) {
    try {


        // -------- pre-action: fetch Clmm pools info and ammV2 pools info --------
        const clmmPools: ApiClmmPoolsItem[] = await formatClmmKeys(PROGRAMIDS.CLMM.toString(), connect) // If the clmm pool is not required for routing, then this variable can be configured as undefined
        const clmmList = Object.values(
            await Clmm.fetchMultiplePoolInfos({ connection: connect, poolKeys: clmmPools, chainTime: new Date().getTime() / 1000 })
        ).map((i) => i.state)
        delay(1000);

        const targetPool = Pool;
        const targetPoolInfo = {
            official: [], unOfficial: [await formatAmmKeysById(targetPool, connect)],

        }
        // If the Liquidity pool is not required for routing, then this variable can be configured as undefined
        console.log("Collected AMM Key info..")
        // -------- step 1: get all route --------
        const getRoute = TradeV2.getAllRoute({
            inputMint: input.inputToken instanceof Token ? input.inputToken.mint : PublicKey.default,
            outputMint: input.outputToken instanceof Token ? input.outputToken.mint : PublicKey.default,
            clmmList: clmmList,
            apiPoolList: targetPoolInfo
        })
        console.log("Route retrieved!")
        // -------- step 2: fetch tick array and pool info --------
        const [tickCache, poolInfosCache] = await Promise.all([
            await Clmm.fetchMultiplePoolTickArrays({ connection: connect, poolKeys: getRoute.needTickArray, batchRequest: true }),
            await TradeV2.fetchMultipleInfo({ connection: connect, pools: getRoute.needSimulate, batchRequest: true }),
        ])
        console.log("Collected pool info!")
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
                connection: connect, mints: [
                    ...clmmPools.map(i => [{ mint: i.mintA, program: i.mintProgramIdA }, { mint: i.mintB, program: i.mintProgramIdB }]).flat().filter(i => i.program === TOKEN_2022_PROGRAM_ID.toString()).map(i => new PublicKey(i.mint)),
                ]
            }),

            epochInfo: await connect.getEpochInfo(),
        })
        console.log("creating swap transaction...")
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

            computeBudgetConfig: { // if you want add compute instruction
                units: 400000, // compute instruction
                microLamports: 1, // fee add 1 * 400000 / 10 ** 9 SOL
            },
            makeTxVersion,
        })
        console.log("Attempting to send transaction...")
        return { txids: await buildAndSendTx(input.wallet, connect, innerTransactions) }
    } catch (error) {
        console.log(error)
        const txids: string[] = [];
        
        return {
            txids: txids}
    }
}

export function delay(ms: number) {
  return new Promise( resolve => setTimeout(resolve, ms) );
}

export async function getUSDCbalance(wallet: Keypair, solanaConnection: Connection) {
   var TokenBalance = 0; 
   try {
        
        const tokenAccount = await getOrCreateAssociatedTokenAccount(solanaConnection, wallet, new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"), wallet.publicKey);
   
        var balance = await solanaConnection.getTokenAccountBalance(tokenAccount.address);
        if (balance.value.uiAmount != null) {
            TokenBalance = balance.value.uiAmount;
            return TokenBalance;
        }
    } catch (error) {
      //error is thrown when no token account exists. The error will go away after you purchase the token for the first time
        console.log("Token Account may not exist yet - Error Message: "+error);

    }
  return TokenBalance;
}

