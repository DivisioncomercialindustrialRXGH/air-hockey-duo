import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
export const BASE='32451c6b8ce4cb0ef44a48d1bfaa551fceea968f';
export const RC1='7697853e819372097ed14b436a20c7f395c2db73';
const TREES={[BASE]:'1cc111e29d92bf110ee096e023ce2472964ca367',[RC1]:'b4f203fae2b1456612336bc157873c79e1c4a064'};
export function extractBaseline(ref=BASE){
  // git am preserves source trees but changes committer timestamps/hashes.
  // Accept only the exact original tree when the delivery was integrated by patch.
  const expectedTree=TREES[ref];
  if(expectedTree){
    const probe=spawnSync('git',['rev-parse',`${ref}^{tree}`],{encoding:'utf8'});
    if(probe.status!==0||probe.stdout.trim()!==expectedTree){
      const commits=execFileSync('git',['log','--all','--format=%H %T'],{encoding:'utf8'}).split('\n');
      const match=commits.find(line=>line.endsWith(` ${expectedTree}`));
      if(!match)throw Error('Requested baseline source tree absent: use the delivered Git bundle or cumulative patch.');
      ref=match.split(' ')[0];
    }
  }
  const dir=mkdtempSync(join(tmpdir(),'air-hockey-baseline-'));
  const files=execFileSync('git',['ls-tree','-r','--name-only',ref],{encoding:'utf8'}).trim().split('\n');
  for(const file of files){
    if(file==='public/music.m4a')continue;
    const path=join(dir,file);mkdirSync(dirname(path),{recursive:true});
    writeFileSync(path,execFileSync('git',['show',`${ref}:${file}`],{maxBuffer:32*1024*1024}));
  }
  return dir;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const dir=extractBaseline();console.log(`Original 5.0.3, ${BASE}, extracted at ${dir}`);
  const result=spawnSync('npm',['test'],{cwd:dir,stdio:'inherit'});process.exitCode=result.status??1;
}
