const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const source=ts.createSourceFile('controls.tsx',fs.readFileSync(path.join(__dirname,'../src/components/staff-controls.tsx'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let valid,filter,historyTextSource;
for(const node of source.statements){
 if(ts.isVariableStatement(node))for(const declaration of node.declarationList.declarations){if(declaration.name.getText(source)==='validSlope')valid=declaration.initializer.getText(source);if(declaration.name.getText(source)==='historyText')historyTextSource=declaration.initializer.getText(source);}
 if(ts.isFunctionDeclaration(node)&&node.name.text==='filterStaffHistory')filter=node.getText(source).replace('export ','');
}
const js=ts.transpileModule(`const historyText=${historyTextSource}; const validSlope=${valid}; ${filter}`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
const {validSlope,filterStaffHistory}=new Function(js+';return {validSlope,filterStaffHistory};')();
for(const value of ['0','0.5','.25','1.25','10','0.075'])assert.equal(validSlope(value),true,value);
for(const value of ['',' ','-1','NaN','Infinity','1.2.3','1abc','1e999'])assert.equal(validSlope(value),false,value);
const rows=[{driver:'Peter Parker',barangay:'Dinaga',truckPlate:'ABC-123',status:'Synced',submittedAt:'Nov 11'},{driver:'Peter Parker',barangay:'Abella',truckPlate:'XYZ-456',status:'Pending',submittedAt:'Nov 12'}];
assert.equal(filterStaffHistory(rows,'  PETER  ','','','','').length,2);
assert.equal(filterStaffHistory(rows,'ABC','','','','')[0],rows[0]);
assert.equal(filterStaffHistory(rows,'','Peter Parker','Abella','XYZ-456','Pending')[0],rows[1]);
assert.equal(filterStaffHistory(rows,'','','Dinaga','','Pending').length,0);
assert.equal(filterStaffHistory(rows,'missing','','','','').length,0);
assert.equal(filterStaffHistory(rows,'','','','','').length,2);
const collections=Array.from({length:8},(_,i)=>({driver:'Area '+i,barangay:i%2?'Dinaga':'Abella',truckPlate:'2026-11-'+(20+i),submittedAt:'2026-11-'+(20+i),status:i%2?'Pending':'Synced'}));
assert.equal(filterStaffHistory(collections,'area 7','','','','')[0],collections[7]);
assert.equal(filterStaffHistory(collections,'2026-11-27','','','','')[0],collections[7]);
assert.equal(filterStaffHistory(collections,'','Area 7','Dinaga','2026-11-27','Pending')[0],collections[7]);
assert.equal(filterStaffHistory(collections,'','','Abella','','Pending').length,0);
assert.equal(filterStaffHistory(collections,'','','','','').length,8);
console.log('PASS: slope decimal/invalid values; case-insensitive history search; combined driver/area/truck/status filters; empty results and clearing.');
assert.equal(filterStaffHistory([{...rows[0],barangay:['Abella','Dinaga']}],'','','Abella, Dinaga','','').length,1);
