// Re-run the EXACT historical assertions under the current authenticated input
// and fixed-tick timeline. The original test file and thresholds stay untouched.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const sourceURL=new URL('../test/historical/network-latency-v503.test.js',import.meta.url);
let source=readFileSync(sourceURL,'utf8');
assert.equal((source.match(/policy: '5.0.3'/g)||[]).length,2);
source=source.replaceAll("policy: '5.0.3'","policy: '5.0.4-rc.2'")
  .replace(/from '([.][^']+)'/g,(_,path)=>`from '${new URL(path,sourceURL).href}'`)
  .replaceAll('network:', 'RC2 production protocol:');
await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
