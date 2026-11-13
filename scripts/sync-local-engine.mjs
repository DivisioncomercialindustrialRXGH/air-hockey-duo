import { readFileSync, writeFileSync } from 'node:fs';
const check = process.argv.includes('--check');
for(const name of ['physics.js','geometry.js']){
  const src=readFileSync(new URL(`../src/${name}`,import.meta.url));
  const output=new URL(`../public/engine/${name}`,import.meta.url);
  if(check){
    const {existsSync}=await import('node:fs');
    if(!existsSync(output)||!src.equals(readFileSync(output)))throw Error(`${name}: browser engine differs from server. Run npm run sync:engine`);
  }else writeFileSync(output,src);
}
console.log(check?'Local bot engine matches server engine':'Browser physics engine refreshed');
