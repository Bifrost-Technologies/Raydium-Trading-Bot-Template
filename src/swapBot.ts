import { TradeToken, BuyType, TradeSide, delay } from './raydiumBotClient';
import {  Keypair,  } from "@solana/web3.js";
import bs58 from "bs58"
(async () => {
    
  var living = true;
  
    while(living)
    {
        //Add logic code here - check token price & metrics before buying etc
        const rpcProvider = "https://mainnet.helius-rpc.com/?api-key=YOUROWNKEYHERE";
        const Account = bs58.decode('SECRET KEY GOES HERE');
        var botAccount = Keypair.fromSecretKey(Account);
        //Replace string variables with the correct token, pool and symbol info. Pool address is the raydium pool address
        //Switch BuyType to USDC if you plan to use USDC pool
        await TradeToken(rpcProvider, botAccount, "TOKEN-ADDRESS-HERE", "POOL-ADDRESS-HERE","TOKEN-SYMBOL-HERE", 9, BuyType.SOL, TradeSide.Buy);
        await delay(1000000000);
         
    }
})
  