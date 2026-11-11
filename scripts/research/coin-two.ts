import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";

const MINT = process.env.MINT_ADDRESS ?? "47DRRsVbezhpcnn2342krbtqYAwBXuo3HcHyfo4Upump";
const KEY = process.env.HELIUS_API_KEY;
if (!KEY) throw new Error("HELIUS_API_KEY secret is required");
const RPC = `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(KEY)}`;
const ENHANCED = `https://api.helius.xyz/v0/transactions?api-key=${encodeURIComponent(KEY)}`;
const OUT = join("data", process.env.OUTPUT_DIR ?? "coin-two");
const MAX_SIGNATURES = Number(process.env.MAX_SIGNATURES ?? 100000);
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
// Free-tier Enhanced API limit is 2 req/s. Target ~1.1 req/s to leave headroom.
const ENHANCED_MIN_INTERVAL_MS=900;
let lastEnhancedRequestAt=0;

let lastRpcRequestAt=0;
// Pace RPC pagination calls as well; getSignaturesForAddress can be rate-limited independently.
const RPC_MIN_INTERVAL_MS=250;
async function rpc(method:string, params:unknown[]) {
  for(let attempt=0;attempt<10;attempt++){
    const waitForSlot=Math.max(0,lastRpcRequestAt+RPC_MIN_INTERVAL_MS-Date.now());
    if(waitForSlot>0) await sleep(waitForSlot);
    lastRpcRequestAt=Date.now();
    const res=await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:"coin-two",method,params}),signal:AbortSignal.timeout(60000)});
    const raw=await res.text();
    let body:any=raw;
    try { body=raw?JSON.parse(raw):null; } catch { /* Helius can return plain-text 429 responses */ }
    if(res.ok && !body?.error) return body?.result;
    const detail=typeof body==="string"?body:JSON.stringify(body);
    if(res.status!==429 && res.status<500) throw new Error(`${method}: ${res.status} ${detail.slice(0,500)}`);
    const retryAfter=res.headers.get("retry-after");
    let retryMs=0;
    if(retryAfter){const seconds=Number(retryAfter);retryMs=Number.isFinite(seconds)?seconds*1000:Math.max(0,Date.parse(retryAfter)-Date.now());}
    const backoff=Math.min(60000,2000*2**attempt);
    const wait=Math.max(retryMs,backoff);
    console.warn(JSON.stringify({phase:"rpc-retry",method,status:res.status,attempt:attempt+1,waitMs:wait}));
    await sleep(wait);
  }
  throw new Error(`${method}: retries exhausted after rate-limit/server backoff`);
}
async function enhanced(signatures:string[]) {
  for(let attempt=0;attempt<8;attempt++){
    const waitForSlot=Math.max(0,lastEnhancedRequestAt+ENHANCED_MIN_INTERVAL_MS-Date.now());
    if(waitForSlot>0) await sleep(waitForSlot);
    lastEnhancedRequestAt=Date.now();
    const res=await fetch(ENHANCED,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({transactions:signatures}),signal:AbortSignal.timeout(60000)});
    // Helius may return plain-text 429 bodies; read text first instead of assuming JSON.
    const raw=await res.text();
    let body:unknown=raw;
    try { body=raw?JSON.parse(raw):null; } catch { /* preserve non-JSON response text */ }
    if(res.ok) return Array.isArray(body)?body:[];
    const detail=typeof body==="string"?body:JSON.stringify(body);
    if(res.status!==429 && res.status<500) throw new Error(`enhanced: ${res.status} ${detail.slice(0,500)}`);
    if(res.status===429 && /credit|monthly quota|out of quota/i.test(detail)){
      throw new Error(`Helius appears to have exhausted the account's available credits/quota: ${detail.slice(0,500)}`);
    }
    const retryAfter=res.headers.get("retry-after");
    let retryMs=0;
    if(retryAfter){
      const seconds=Number(retryAfter);
      retryMs=Number.isFinite(seconds)?seconds*1000:Math.max(0,Date.parse(retryAfter)-Date.now());
    }
    const backoff=Math.min(60000,2000*2**attempt);
    await sleep(Math.max(retryMs,backoff));
    console.warn(JSON.stringify({phase:"enhanced-retry",status:res.status,attempt:attempt+1,waitMs:Math.max(retryMs,backoff)}));
  }
  throw new Error("enhanced transactions retries exhausted after rate-limit/server backoff");
}
async function main(){
  await mkdir(OUT,{recursive:true});
  // Helius getAsset on this RPC endpoint expects the mint as its positional string parameter.
  const asset=await rpc("getAsset",[MINT]);
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
  console.log("COIN_TWO_REPORT "+JSON.stringify(report));
}
await main();
