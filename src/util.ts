import {
  buildSimpleTransaction,
  findProgramAddress,
  InnerSimpleV0Transaction,
  SPL_ACCOUNT_LAYOUT,
  TOKEN_PROGRAM_ID,
  TokenAccount,
} from '@raydium-io/raydium-sdk';
import {
  Connection,
  Keypair,
  PublicKey,
  SendOptions,
  Signer,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';

import {
  addLookupTableInfo,
  makeTxVersion,
} from '../config';

export async function sendTx(
    connection: Connection,
    payer: Keypair | Signer,
    txs: (VersionedTransaction | Transaction)[],
    options?: SendOptions
): Promise<string[]> {
    try {
        const connect = connection
        const txids: string[] = [];
        for (const iTx of txs) {
            if (iTx instanceof VersionedTransaction) {
                iTx.sign([payer]);
                txids.push(await connect.sendTransaction(iTx, options));
                console.log("Transaction sent!")
            } else {
                txids.push(await connect.sendTransaction(iTx, [payer], options));
                console.log("Transaction sent!")
            }
        }
        return txids;
    } catch (error) {
        console.log(error)
        const txids: string[] = [];
        return txids;
    }
}

export async function getWalletTokenAccount(connection: Connection, wallet: PublicKey): Promise<TokenAccount[]> {
  const walletTokenAccount = await connection.getTokenAccountsByOwner(wallet, {
    programId: TOKEN_PROGRAM_ID,
  });
  return walletTokenAccount.value.map((i) => ({
    pubkey: i.pubkey,
    programId: i.account.owner,
    accountInfo: SPL_ACCOUNT_LAYOUT.decode(i.account.data),
  }));
}

export async function buildAndSendTx(wallet: Keypair, connection: Connection, innerSimpleV0Transaction: InnerSimpleV0Transaction[], options?: SendOptions) {
    try {
        const willSendTx = await buildSimpleTransaction({
            connection,
            makeTxVersion,
            payer: wallet.publicKey,
            innerTransactions: innerSimpleV0Transaction,
            addLookupTableInfo: addLookupTableInfo,
        })
        console.log("Sending transaction...");
        return await sendTx(connection, wallet, willSendTx, options)
    } catch (error) {
        console.log(error)
        return null
    }
}

export function getATAAddress(programId: PublicKey, owner: PublicKey, mint: PublicKey) {
  const { publicKey, nonce } = findProgramAddress(
    [owner.toBuffer(), programId.toBuffer(), mint.toBuffer()],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
  );
  return { publicKey, nonce };
}

export async function sleepTime(ms: number) {
  console.log((new Date()).toLocaleString(), 'sleepTime', ms)
  return new Promise(resolve => setTimeout(resolve, ms))
}
