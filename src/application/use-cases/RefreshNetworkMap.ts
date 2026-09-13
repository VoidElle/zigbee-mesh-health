import type { MeshScanner } from '../../domain/ports';
import type { ManualRefreshResult, MeshScanResult } from '../../domain/entities';

export function createRefreshNetworkMap({ scanner }: { scanner: MeshScanner }) {
  return {
    request(forceManual?: boolean): Promise<MeshScanResult> {
      return scanner.request(forceManual);
    },
    triggerManualRefresh(): ManualRefreshResult {
      return scanner.triggerManualRefresh();
    },
  };
}
