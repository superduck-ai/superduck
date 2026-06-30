import { AgentIndicatorController } from './agentIndicator/controller';

(function () {
  if ((window as any).__superduck_agent_indicator_loaded__) return;
  (window as any).__superduck_agent_indicator_loaded__ = true;

  new AgentIndicatorController();
})();
