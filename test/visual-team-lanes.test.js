import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Verifica la función de geometría exacta que ejecuta el navegador,
// en lugar de mantener una segunda copia que pueda divergir.
const source=fs.readFileSync(new URL('../public/game.js',import.meta.url),'utf8');
const m=source.match(/function screenLaneFor\(index,s\)\{[\s\S]*?\n\}/);
assert.ok(m,'screenLaneFor debe existir en el cliente');
function geometry(side){
  return vm.runInNewContext(`(${m[0]})`,{W:500,sideFor:()=>side});
}
for(const [mode,count] of [['duo',2],['teams',4]]){
  for(const view of [0,1]){
    test(`${mode} pantalla ${view?'rosada':'azul'}: las etiquetas siguen carriles del puck`,()=>{
      const laneFor=geometry(view);
      for(let i=0;i<count*2;i++){
        const column=i%count;
        const canonicalLeft=column*500/count;
        const canonicalRight=(column+1)*500/count;
        const expected=view===1?[500-canonicalRight,500-canonicalLeft]:[canonicalLeft,canonicalRight];
        assert.deepEqual(Array.from(laneFor(i,{settings:{mode}})),expected,`Jugador ${i}`);
        // La paleta puede estar en cualquier punto de su carril y su etiqueta
        // debe permanecer siempre en el mismo carril tras la rotación.
        for(const pct of [.1,.5,.9]){
          const canonicalX=canonicalLeft+(canonicalRight-canonicalLeft)*pct;
          const screenX=view===1?500-canonicalX:canonicalX;
          const [left,right]=laneFor(i,{settings:{mode}});
          assert.ok(screenX>=left&&screenX<=right,`P${i}, x=${screenX}, carril=[${left},${right}]`);
        }
      }
    });
  }
}
