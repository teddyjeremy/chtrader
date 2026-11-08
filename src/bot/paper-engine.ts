import type { ClosedPaperTrade, Decision, MarketSnapshot, PaperPosition } from "./types.js";
export type PaperConfig = {
  startingEquitySol:number; maxPositionSol:number; maxOpenPositions:number;
  riskFraction:number; stopLossFraction:number; takeProfitFraction:number;
  trailingStopFraction:number; maxHoldSeconds:number; estimatedExitCostFraction:number;
};
export const DEFAULT_PAPER_CONFIG:PaperConfig = {
  startingEquitySol:0.05, maxPositionSol:0.006, maxOpenPositions:1,
  riskFraction:0.01, stopLossFraction:0.08, takeProfitFraction:0.15,
  trailingStopFraction:0.07, maxHoldSeconds:60, estimatedExitCostFraction:0.02
};
export class PaperEngine {
  private equitySol:number;
  private readonly positions=new Map<string,PaperPosition>();
  private readonly closed:ClosedPaperTrade[]=[];
  private readonly decisions:Decision[]=[];
  private consecutiveLosses=0;
  private halted=false;
  constructor(private readonly config:PaperConfig=DEFAULT_PAPER_CONFIG) { this.equitySol=config.startingEquitySol; }
  getState() {
    return {mode:"paper" as const,equitySol:this.equitySol,halted:this.halted,
      consecutiveLosses:this.consecutiveLosses,openPositions:[...this.positions.values()],
      closedTrades:this.closed.slice(-200),recentDecisions:this.decisions.slice(-200),
      totalTrades:this.closed.length,netPnlSol:this.equitySol-this.config.startingEquitySol};
  }
  recordDecision(d:Decision):void {
    this.decisions.push(d);
    if(this.decisions.length>2000) this.decisions.splice(0,this.decisions.length-2000);
  }
  open(d:Decision,s:MarketSnapshot):boolean {
    if(this.halted||d.action!=="buy"||this.positions.size>=this.config.maxOpenPositions||this.positions.has(s.mint)) return false;
    if(!(s.priceSol>0)||!s.exitRouteAvailable) return false;
    const riskSol=this.equitySol*this.config.riskFraction;
    const stopDistance=s.priceSol*this.config.stopLossFraction;
    const riskSizedNotional=stopDistance>0?riskSol*s.priceSol/stopDistance:0;
    const notionalSol=Math.min(this.config.maxPositionSol,riskSizedNotional,this.equitySol*0.25);
    if(notionalSol<=0||notionalSol>this.equitySol) return false;
    this.positions.set(s.mint,{
      mint:s.mint,entryPriceSol:s.priceSol,quantity:notionalSol/s.priceSol,notionalSol,
      openedAtMs:s.timestampMs,stopPriceSol:s.priceSol*(1-this.config.stopLossFraction),
      takeProfitPriceSol:s.priceSol*(1+this.config.takeProfitFraction),
      highestPriceSol:s.priceSol,entryCostSol:notionalSol*s.estimatedRoundTripFeePct/200
    });
    return true;
  }
  mark(s:MarketSnapshot):ClosedPaperTrade|null {
    const p=this.positions.get(s.mint);
    if(!p||!(s.priceSol>0)) return null;
    p.highestPriceSol=Math.max(p.highestPriceSol,s.priceSol);
    const trailing=p.highestPriceSol*(1-this.config.trailingStopFraction);
    const effectiveStop=Math.max(p.stopPriceSol,trailing);
    const age=(s.timestampMs-p.openedAtMs)/1000;
    let reason="";
    if(!s.exitRouteAvailable||!s.marketStateVerified) reason="emergency_exit_route_or_state_failure";
    else if(s.creatorDistributing||s.suspiciousClusterDominance) reason="emergency_distribution_or_cluster";
    else if(s.priceSol<=effectiveStop) reason="structure_or_trailing_stop";
    else if(s.priceSol>=p.takeProfitPriceSol) reason="take_profit";
    else if(age>=this.config.maxHoldSeconds) reason="time_decay";
    if(!reason) return null;
    const gross=(s.priceSol-p.entryPriceSol)*p.quantity;
    const costs=p.notionalSol*this.config.estimatedExitCostFraction+p.entryCostSol;
    const net=gross-costs;
    this.equitySol+=gross-costs;
    this.positions.delete(s.mint);
    const trade:ClosedPaperTrade={mint:s.mint,openedAtMs:p.openedAtMs,closedAtMs:s.timestampMs,
      entryPriceSol:p.entryPriceSol,exitPriceSol:s.priceSol,quantity:p.quantity,
      grossPnlSol:gross,estimatedCostsSol:costs,netPnlSol:net,exitReason:reason};
    this.closed.push(trade);
    this.consecutiveLosses=net<0?this.consecutiveLosses+1:0;
    if(this.consecutiveLosses>=3) this.halted=true;
    return trade;
  }
}