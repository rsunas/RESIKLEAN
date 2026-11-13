const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react'),RN=require('react-native-web');
let state=[],cursor=0,effects=[],focused=0,dismissed=0;
const Input=()=>null;
const hooks={...React,useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>state[i]=v];},useRef:()=>({current:{blur(){},focus(){focused++;}}}),useEffect:fn=>effects.push(fn)};
const mocks={react:hooks,'react-native':{...RN,Keyboard:{dismiss(){dismissed++;}},useWindowDimensions:()=>({fontScale:1})},'heroui-native':{Input},'expo/node_modules/@expo/vector-icons':{Feather:()=>null},'@/components/app-text':{AppText:RN.Text}};
const output={};const js=ts.transpileModule(fs.readFileSync(__dirname+'/../src/components/searchable-select.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('require','exports',js)(name=>mocks[name]||require(name),output);
const props={value:'Abella',options:[{value:'Abella',label:'Abella',description:'Area 5'},{value:'Balatas',label:'Balatas',description:'Area 9'}],onChange:v=>{props.value=v;},onSearchFocus(){focused++;}};
function tree(){cursor=0;effects=[];return output.SearchableSelect(props);}
function nodes(n){return !n||typeof n!=='object'?[]:[n,...React.Children.toArray(n.props?.children).flatMap(nodes)];}
const input=()=>nodes(tree()).find(n=>n.type===Input);
assert.equal(input().props.value,'Abella');input().props.onFocus();assert.equal(focused,1);
assert.equal(nodes(tree()).filter(n=>n.type===RN.Pressable&&n.props.accessibilityLabel==='Balatas').length,1);
input().props.onChangeText('bala');assert.equal(props.value,'','Unselected typed text must not submit stale location');effects.forEach(fn=>fn());assert.equal(input().props.value,'bala');
assert.equal(nodes(tree()).filter(n=>n.type===RN.Pressable&&n.props.accessibilityLabel==='Abella').length,0);
nodes(tree()).find(n=>n.type===RN.Pressable&&n.props.accessibilityLabel==='Balatas').props.onPress();assert.equal(props.value,'Balatas');assert.equal(input().props.value,'Balatas');assert.equal(dismissed,1);
input().props.onFocus();input().props.onChangeText('unknown');assert.ok(nodes(tree()).some(n=>n.props?.children==='No matching options'));
assert.ok(!js.includes('Select.Portal'),'No floating dialog for search');
console.log('PASS: typing in field, inline suggestions, area matching, stale selection invalidation, selection and empty results.');
