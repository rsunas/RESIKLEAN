const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const file=ts.createSourceFile('staff.tsx',fs.readFileSync(__dirname+'/../app/staff.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let reveal;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(file)==='revealPileFields')reveal=n.initializer.getText(file);ts.forEachChild(n,visit);}visit(file);
const js=ts.transpileModule('const reveal='+reveal,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
for(const heightSuggestions of ['front','middle','back','single',null]){
 let y=0,fieldY=610,scrollY=100;
 const inputScrollY={current:120};
 const context={heightSuggestions,pileRevealFrame:{current:null},activePileField:{current:heightSuggestions},cancelAnimationFrame:()=>{},requestAnimationFrame:fn=>fn(),pileFields:{current:{measureInWindow:fn=>fn(0,fieldY)}},inputScrollY,inputScroll:{current:{getNativeScrollRef:()=>({measureInWindow:fn=>fn(0,scrollY)}),scrollTo:args=>{y=args.y;}}}};
 const run=new Function(...Object.keys(context),js+';return reveal;')(...Object.values(context));
 run(); assert.equal(y,heightSuggestions?622:0);
 if(heightSuggestions){inputScrollY.current=622;fieldY=108;run();assert.equal(y,622);fieldY=95;run();assert.equal(y,609);}
}
const hookSource=ts.transpileModule(fs.readFileSync(__dirname+'/../src/hooks/use-keyboard-visible.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
for(const os of ['android','ios']){
 const listeners={},removed=[];let visible=false,cleanup;
 const output={};
 new Function('require','exports',hookSource)(name=>name==='react'?{useState:init=>[init(),v=>{visible=v;}],useEffect:fn=>{cleanup=fn();}}:{Platform:{OS:os},Keyboard:{isVisible:()=>false,addListener:(event,fn)=>{listeners[event]=fn;return{remove:()=>removed.push(event)};}}},output);
 output.useKeyboardVisible();listeners[os==='ios'?'keyboardWillShow':'keyboardDidShow']();assert.equal(visible,true);
 listeners[os==='ios'?'keyboardWillHide':'keyboardDidHide']();assert.equal(visible,false);cleanup();assert.equal(removed.length,2);
}
console.log('PASS: all four height fields scroll into view after resizing without cumulative drift; Android/iOS keyboard visibility and listener cleanup.');

const React = require('react');
const viewportCode = ts.transpileModule(fs.readFileSync(__dirname + '/../src/components/keyboard-viewport.tsx', 'utf8'), {
 compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
let hookIndex = 0, keyboardOpen = false, autoScrolls = 0, manualReveals = 0;
const refs = [], effects = [], frames = new Map(); let nextFrame = 0;
const nativeScroll = { scrollResponderScrollNativeHandleToKeyboard: () => autoScrolls++ };
const output = {};
new Function('require','exports','requestAnimationFrame','cancelAnimationFrame', viewportCode)(name => {
 if (name === 'react') return { ...React,
   useRef: initial => { const index = hookIndex++; return refs[index] ||= { current: initial }; },
   useContext: () => ({ managed: true, keyboardOpen }), useEffect: fn => effects.push(fn),
 };
 if (name === 'react/jsx-runtime') return require(name);
 if (name === 'react-native') return { ScrollView: 'ScrollView', Platform: { OS: 'android' }, TextInput: { State: { currentlyFocusedInput: () => ({}) } } };
 if (name === '@/hooks/use-keyboard-viewport') return {};
 throw new Error(name);
}, output, fn => { frames.set(++nextFrame, fn); return nextFrame; }, id => frames.delete(id));
const flush = () => { const tasks = [...frames.values()]; frames.clear(); tasks.forEach(fn => fn()); };
const render = enabled => {
 hookIndex = 0;
 const tree = output.KeyboardScrollView.render({ automaticallyRevealFocusedInput: enabled,
   onFocus: () => manualReveals++, onLayout: () => manualReveals++ }, null);
 tree.props.ref(nativeScroll); effects.splice(0).forEach(fn => fn()); return tree;
};
let tree = render(true);
tree.props.onFocus({}); // Generic reveal queued before the selected pile state commits.
tree = render(false); flush();
assert.equal(autoScrolls, 0, 'stale generic reveal must not undo pile alignment');
keyboardOpen = true; tree = render(false); tree.props.onLayout({}); flush();
assert.equal(autoScrolls, 0, 'keyboard resize keeps pile scrolling under staff control');
assert.equal(manualReveals, 2, 'focus and resized layout still invoke staff reveal');
tree = render(true); tree.props.onFocus({}); flush();
assert.equal(autoScrolls, 1, 'other inputs retain automatic scrolling');
console.log('PASS: keyboard resize and queued automatic scroll cannot override pile positioning; ordinary input scrolling preserved.');
