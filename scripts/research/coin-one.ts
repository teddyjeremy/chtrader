import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";

const MINT = "Hp7d7hFtMJ42qBfxd6o9ePWFNHXEg7uS9RbBYzhygoat";
const KEY = process.env.HELIUS_API_KEY;
if (!KEY) throw new Error("HELIUS_API_KEY secret is required");
const RPC = `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(KEY)}`;
const ENHANCED = `https://api.helius.xyz/v0/transactions?api-key=${encodeURIComponent(KEY)}`;
const OUT = join("data","coin-one");
const MAX_SIGNATURES = Number(process.env.MAX_SIGNATURES ?? 100000);
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

async function rpc(method:string, params:unknown[]) {
  for(let attempt=0;attempt<6;attempt++){
    const res=await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:"coin-one",method,params}),signal:AbortSignal.timeout(60000)});
    const body=await res.json() as {result?:unknown;error?:{message?:string}};
    if(res.ok && !body.error) return body.result;
    if(res.status!==429 && res.status<500) throw new Error(`${method}: ${res.status} ${JSON.stringify(body).slice(0,500)}`);
    await sleep(Math.min(30000,1000*2**attempt));
  }
  throw new Error(`${method}: retries exhausted`);
}
async function enhanced(signatures:string[]) {
  for(let attempt=0;attempt<6;attempt++){
    const res=await fetch(ENHANCED,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({transactions:signatures}),signal:AbortSignal.timeout(60000)});
    const body=await res.json() as unknown;
    if(res.ok) return Array.isArray(body)?body:[];
    if(res.status!==429 && res.status<500) throw new Error(`enhanced: ${res.status} ${JSON.stringify(body).slice(0,500)}`);
    await sleep(Math.min(30000,1000*2**attempt));
  }
  throw new Error("enhanced transactions retries exhausted");
}
async function main(){
  await mkdir(OUT,{recursive:true});
  const asset=await rpc("getAsset",[{id:MINT}]);
  const supply=await rpc("getTokenSupply",[MINT]);
  const largest=await rpc("getTokenLargestAccounts",[MINT,{commitment:"finalized"}]);
  const dexRes=await fetch(`https://api.dexscreener.com/token-pairs/v1/solana/${MINT}`,{signal:AbortSignal.timeout(30000)});
  const dex=dexRes.ok?await dexRes.json():{httpStatus:dexRes.status};
  await writeFile(join(OUT,"metadata-market.json"),JSON.stringify({mint:MINT,fetchedAt:new Date().toISOString(),asset,supply,largestTokenAccounts:largest,dexPairs:dex},null,2));

  const signatures:Array<{signature:string;slot:number;blockTime:number|null;err:unknown}>= [];
  let before:string|undefined, done=false;
  while(!done && signatures.length<MAX_SIGNATURES){
    const options:Record<string,unknown>={limit:1000,commitment:"finalized"};
    if(before) options.before=before;
    const page=await rpc("getSignaturesForAddress",[MINT,options]) as typeof signatures;
    if(!page.length){done=true;break;}
    signatures.push(...page);
    before=page[page.length-1].signature;
    console.log(JSON.stringify({phase:"signatures",count:signatures.length,oldestBlockTime:page[page.length-1].blockTime,oldestSignature:before}));
    if(page.length<1000){done=true;break;}
  }
  const truncated=signatures.length>=MAX_SIGNATURES;
  await writeFile(join(OUT,"signatures.json"),JSON.stringify({mint:MINT,count:signatures.length,truncated,complete:done&&!truncated,oldest:signatures.at(-1),newest:signatures[0]},null,2));
  const rawPath=join(OUT,"enhanced-transactions.jsonl");
  await writeFile(rawPath,"");
  const summaryPath=join(OUT,"trade-events.jsonl");
  await writeFile(summaryPath,"");
  let fetched=0, missing=0, swaps=0, tokenTransfers=0, failed=0;
  for(let i=0;i<signatures.length;i+=100){
    const batch=signatures.slice(i,i+100);
    const rows=await enhanced(batch.map(x=>x.signature));
    const bySig=new Map(rows.map((x:any)=>[x.signature,x]));
    const rawLines:string[]=[];
    const eventLines:string[]=[];
    for(const sig of batch){
      const tx:any=bySig.get(sig.signature);
      if(!tx){missing++;continue;}
      fetched++;
      if(tx.transactionError || sig.err) failed++;
      rawLines.push(JSON.stringify(tx));
      const transfers=(tx.tokenTransfers??[]).filter((t:any)=>t.mint===MINT);
      tokenTransfers+=transfers.length;
      if(String(tx.type??"").toUpperCase()==="SWAP" || transfers.length){
        swaps++;
        const payer=String(tx.feePayer??"");
        for(const tr of transfers){
          const from=String(tr.fromUserAccount??"");
          const to=String(tr.toUserAccount??"");
          const side=to===payer?"buy":from===payer?"sell":"transfer_or_router";
          eventLines.push(JSON.stringify({signature:sig.signature,slot:sig.slot,timestamp:sig.blockTime??tx.timestamp??null,feePayer:payer,side,tokenAmount:tr.tokenAmount??null,tokenAmountRaw:tr.rawTokenAmount??null,fromUserAccount:from,toUserAccount:to,source:tx.source??null,type:tx.type??null,description:tx.description??null,tokenTransfers:transfers,nativeTransfers:tx.nativeTransfers??[]}));
        }
      }
    }
    if(rawLines.length) await appendFile(rawPath,rawLines.join("\n")+"\n");
    if(eventLines.length) await appendFile(summaryPath,eventLines.join("\n")+"\n");
    console.log(JSON.stringify({phase:"enhanced",processed:Math.min(i+100,signatures.length),total:signatures.length,fetched,missing,swaps,tokenTransfers,failed}));
    if(i%1000===900) await sleep(500);
  }
  const report={mint:MINT,generatedAt:new Date().toISOString(),signatureCount:signatures.length,historyComplete:done&&!truncated,truncatedAtLimit:truncated,enhancedFetched:fetched,enhancedMissing:missing,transactionsWithSwapOrTokenTransfer:swaps,matchingTokenTransferCount:tokenTransfers,failedTransactions:failed,files:["metadata-market.json","signatures.json","enhanced-transactions.jsonl","trade-events.jsonl"],caveats:["getSignaturesForAddress on the mint account may not include every routed trade if the mint account is not present in a transaction's account keys; compare against Pump bonding-curve and migrated pool program scans before treating coverage as exhaustive.","feePayer is only a wallet proxy; relayers and sponsored transactions can make it inaccurate.","A token transfer in a swap is not enough to infer buyer/seller if routers or vault accounts are involved. Review raw transaction account data and instruction structure.","DexScreener endpoint provides current pair state, not historical candles. Historical price reconstruction must be derived from swaps and reserves.","Largest token accounts are raw token accounts, not necessarily unique beneficial owners; aggregate by owner and classify pools/program accounts before concentration analysis."]};
  await writeFile(join(OUT,"report.json"),JSON.stringify(report,null,2));
  console.log("COIN_ONE_REPORT "+JSON.stringify(report));
}
await main();
