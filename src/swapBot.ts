import { TradeToken, TradeSide, delay, CurrencyType } from './raydiumBotClient';
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
     
        //Switch CurrencyType to USDC if you plan to use USDC pool
        await TradeToken(rpcProvider, botAccount, 10000, "TOKEN-ADDRESS-HERE", "POOL-ADDRESS-HERE", 9, CurrencyType.SOL, TradeSide.Buy);
        await delay(1000000000);
         
    }
})
  