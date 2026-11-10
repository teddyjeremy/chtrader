import { createReadStream } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";

type AnyObj = Record<string, any>;
type Event = { signature:string; timestamp:number; slot:number; ordinal:number; side:"buy"|"sell"|"unknown"; tokenAmount:number; quoteSol:number; priceSol:number|null; wallet:string; source:string; confidence:string };
const MINTS:Record<string,string>={
  "coin-one":"Hp7d7hFtMJ42qBfxd6o9ePWFNHXEg7uS9RbBYzhygoat",
  "coin-two":"47DRRsVbezhpcnn2342krbtqYAwBXuo3HcHyfo4Upump",
  "coin-three":"6r7D6ab6agnc5VcJxApia4HqbRikAeAEus2UYF9hpump",
  "coin-four":"BYurrzk6JV3YaqwwVDAq7rvZC7mBGY1xCTE8PG5dpump",
  "coin-five":"Cg1g9zBvydiuvCuqiLy5XrmR2LXyU54FGUHhzGVApump",
  "coin-six":"2NFDhipSmrn3GaU7UK6jPvYxbveBUvNs6ec71r2ipump"
};
const PUMP="6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const PUMPSWAP="pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
const DISC:Record<string,"buy"|"sell">={
  "66063d1201daebea":"buy","38fc74089edfcd5f":"buy","07051dc4f5176550":"buy","e1f7501ed5b38488":"buy",
  "33e685a4017f83ad":"sell","1c92de7726c469d5":"sell"
};
const B58="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Hex(s:string):string { let n=0n; for(const c of s){const i=B58.indexOf(c);if(i<0)return "";n=n*58n+BigInt(i)}let h=n.toString(16);if(h.length%2)h="0"+h;let z=0;while(z<s.length&&s[z]==="1")z++;return "00".repeat(z)+h; }
function obj(x:any):AnyObj{return x&&typeof x==="object"?x:{}}
function n(x:any):number{const v=Number(x);return Number.isFinite(v)?v:0}
function flattenInstructions(tx:AnyObj):AnyObj[]{const out:AnyObj[]=[];const walk=(v:any)=>{if(Array.isArray(v)){for(const x of v)walk(x);return}if(!v||typeof v!=="object")return;if(typeof v.programId==="string"||typeof v.program==="string")out.push(v);for(const [k,x] of Object.entries(v))if(k==="instructions"||k==="innerInstructions"||k==="compiledInstructions")walk(x)};walk(tx.instructions);walk(tx.transaction?.message?.instructions);walk(tx.events);return out}
function instructionSide(tx:AnyObj):"buy"|"sell"|"unknown"{for(const ix of flattenInstructions(tx)){const pid=String(ix.programId??ix.program??"");if(pid!==PUMP)continue;const data=String(ix.data??"");const hex=/^[0-9a-fA-F]+$/.test(data)?data.toLowerCase():base58Hex(data).toLowerCase();const side=DISC[hex.slice(0,16)];if(side)return side}return "unknown"}
function tokenDelta(tx:AnyObj,mint:string,payer:string):{amount:number;decimals:number}{let amount=0,decimals=0;for(const t of (tx.tokenTransfers??[])){if(t.mint!==mint)continue;const d=n(t.tokenAmount);if(t.toUserAccount===payer)amount+=d;if(t.fromUserAccount===payer)amount-=d}return {amount,decimals:0}}
function quoteDelta(tx:AnyObj,payer:string):number{let sol=0;for(const t of (tx.nativeTransfers??[])){const v=n(t.amount)/1e9;if(t.toUserAccount===payer)sol-=v;if(t.fromUserAccount===payer)sol+=v}return sol}
function csv(v:any):string{const s=String(v??"");return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function writeCsv(headers:string[],rows:any[][]):string{return [headers.join(","),...rows.map(r=>r.map(csv).join(","))].join("\n")+"\n"}
async function readEvents(coin:string,mint:string):Promise<{events:Event[];quality:AnyObj}>{
 const file=join("data",coin,"enhanced-transactions.jsonl");let ordinal=0,malformed=0,failed=0,withMint=0,swapCandidates=0,unknownSide=0;const events:Event[]=[];
 try{await readdir(join("data",coin))}catch{return {events,quality:{missingRawFile:true}}}
 const rl=createInterface({input:createReadStream(file),crlfDelay:Infinity});
 for await(const line of rl){if(!line.trim())continue;ordinal++;let tx:AnyObj;try{tx=obj(JSON.parse(line))}catch{malformed++;continue}
  if(tx.transactionError||tx.meta?.err){failed++;continue}
  const payer=String(tx.feePayer??tx.transaction?.message?.accountKeys?.[0]?.pubkey??"");
  const transfers=(tx.tokenTransfers??[]).filter((t:any)=>t.mint===mint);
  const side=instructionSide(tx);
  const isSwap=side!=="unknown"||String(tx.type??"").toUpperCase()==="SWAP"||String(tx.source??"").toLowerCase().includes("pump");
  if(!isSwap||!transfers.length)continue;
  swapCandidates++;withMint++;
  const delta=tokenDelta(tx,mint,payer);let actualSide=side;
  if(actualSide==="unknown"&&delta.amount>0)actualSide="buy";else if(actualSide==="unknown"&&delta.amount<0)actualSide="sell";
  if(actualSide==="unknown")unknownSide++;
  const tokenAmount=Math.abs(delta.amount)||transfers.reduce((s:number,t:any)=>s+n(t.tokenAmount),0);
  const quoteSol=Math.abs(quoteDelta(tx,payer));
  const timestamp=n(tx.timestamp??tx.blockTime);if(!timestamp)continue;
  events.push({signature:String(tx.signature??""),timestamp,slot:n(tx.slot),ordinal,side:actualSide,tokenAmount,quoteSol,priceSol:tokenAmount>0&&quoteSol>0?quoteSol/tokenAmount:null,wallet:payer,source:String(tx.source??tx.type??"unknown"),confidence:side!=="unknown"?"pump_instruction":delta.amount!==0?"payer_token_delta":"heuristic_candidate"});
 }
 events.sort((a,b)=>a.timestamp-b.timestamp||a.slot-b.slot||a.ordinal-b.ordinal);
 return {events,quality:{inputRecords:ordinal,malformedLines:malformed,failedTransactions:failed,swapCandidates,events:events.length,unknownSideEvents:unknownSide,eventsWithNoWallet:events.filter(e=>!e.wallet).length,coverageNote:"Candidate extraction from Enhanced Transactions. SOL quote amounts are inferred from fee-payer native transfers and can include fees or routed transfers; treat as provisional until reconciled against pool/curve vault balance deltas and PumpSwap instructions."}};
}
function bucketRows(events:Event[],seconds:number):any[][]{
 if(!events.length)return [];
 const start=Math.floor(events[0].timestamp/seconds)*seconds,end=Math.floor(events[events.length-1].timestamp/seconds)*seconds;
 const rows:any[][]=[];let i=0;
 for(let t=start;t<=end;t+=seconds){const group:Event[]=[];while(i<events.length&&events[i].timestamp<t+seconds){if(events[i].timestamp>=t)group.push(events[i]);i++}
  const buys=group.filter(e=>e.side==="buy"),sells=group.filter(e=>e.side==="sell"),unknown=group.filter(e=>e.side==="unknown");
  const buySol=buys.reduce((s,e)=>s+e.quoteSol,0),sellSol=sells.reduce((s,e)=>s+e.quoteSol,0),prices=group.map(e=>e.priceSol).filter((v):v is number=>v!==null).sort((a,b)=>a-b);
  const median=prices.length?(prices.length%2?prices[(prices.length-1)/2]:(prices[prices.length/2-1]+prices[prices.length/2])/2):"";
  rows.push([t,new Date(t*1000).toISOString(),seconds,group.length,buys.length,sells.length,unknown.length,buySol,sellSol,buySol-sellSol,group.reduce((s,e)=>s+e.tokenAmount,0),new Set(group.map(e=>e.wallet).filter(Boolean)).size,median,prices.length]);
 }
 return rows;
}
async function main(){const summaries:any[]=[];for(const [coin,mint] of Object.entries(MINTS)){const {events,quality}=await readEvents(coin,mint);const dir=join("data",coin,"micro-windows");await mkdir(dir,{recursive:true});for(const seconds of [5,15,30,60])await writeFile(join(dir,`${seconds}s-windows.csv`),writeCsv(["window_start_unix","window_start_utc","window_seconds","swap_candidates","buys","sells","unknown_side","buy_quote_sol_est","sell_quote_sol_est","net_buy_quote_sol_est","token_amount_sum","distinct_fee_payers","median_execution_price_sol_per_token_est","priced_events"],bucketRows(events,seconds)));const summary={coin,mint,eventCount:events.length,firstEvent:events[0]??null,lastEvent:events.at(-1)??null,quality,outputs:["5s-windows.csv","15s-windows.csv","30s-windows.csv","60s-windows.csv"]};await writeFile(join(dir,"quality-report.json"),JSON.stringify(summary,null,2));summaries.push(summary);console.log("MICRO_WINDOW_REPORT",JSON.stringify({coin,eventCount:events.length,quality}));}await writeFile(join("data","all-coins-micro-window-index.json"),JSON.stringify({generatedAt:new Date().toISOString(),method:"5s/15s primary bins; 30s/60s context; fixed UTC epoch-aligned bins; transaction ordering timestamp, slot, original input order",coins:summaries},null,2));}
await main();
