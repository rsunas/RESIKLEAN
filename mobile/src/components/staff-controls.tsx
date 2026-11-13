import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Input, Slider } from 'heroui-native';
import { AppText as Text } from '@/components/app-text';
import { SearchableSelect as StaffSearchSelect } from '@/components/searchable-select';
export { SearchableSelect as StaffSearchSelect } from '@/components/searchable-select';

export const validSlope = (value: string) => /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()) && Number.isFinite(Number(value)) && Number(value) >= 0;
export function StaffSlopeInput({value, onChange}: {value: string; onChange: (value: string) => void}) {
  const numeric = Number(value);
  return <View style={styles.field}>
    <Text style={styles.title}>Slope (m³)</Text>
    <Text style={styles.hint}>Quick range: 0–1 m³. Enter another non-negative value below if needed.</Text>
    <Slider minValue={0} maxValue={1} step={0.1} value={validSlope(value) ? Math.min(numeric, 1) : 0} onChange={next => onChange(Number(next).toFixed(1))} style={{paddingVertical: 16}}>
      <Slider.Track><Slider.Fill /><Slider.Thumb accessibilityLabel="Slope quick range" /></Slider.Track>
    </Slider>
    <View style={styles.range}><Text>0 m³</Text><Text>0.5 m³</Text><Text>1 m³</Text></View>
    <Input accessibilityLabel="Slope in cubic metres" keyboardType="decimal-pad" value={value} onChangeText={onChange} placeholder="e.g. 0.5" style={styles.input} />
    {!validSlope(value) ? <Text accessibilityRole="alert" style={styles.error}>Enter a valid slope of 0 m³ or more.</Text> : null}
    {validSlope(value) && numeric > 1 ? <Text style={styles.hint}>Using manual value: {value} m³</Text> : null}
  </View>;
}

export const historyText = (value: unknown): string => Array.isArray(value) ? value.map(historyText).filter(Boolean).join(', ') : typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';

type RecordRow = { driver: string; barangay: string; truckPlate: string; status: string; submittedAt: string };
export function filterStaffHistory<T extends RecordRow>(rows: T[], query: string, driver: string, area: string, truck: string, status: string) {
  const search = query.trim().toLowerCase();
  return rows.filter(row => (!driver || historyText(row.driver) === driver) && (!area || historyText(row.barangay) === area) && (!truck || historyText(row.truckPlate) === truck) && (!status || row.status === status) && [row.driver, row.barangay, row.truckPlate, row.submittedAt].join(' ').toLowerCase().includes(search));
}
export function StaffHistoryFilters({rows, value, onChange}: {rows: RecordRow[]; value: string[]; onChange: (query: string, driver: string, area: string, truck: string, status: string) => void}) {
  const [query, ...filters] = value;
  const [focused, setFocused] = useState(false);
  const update = (text: string, next = filters) => {onChange(text, next[0], next[1], next[2], next[3]);};
  const values = (key: keyof RecordRow) => [...new Set(rows.map(row => historyText(row[key])).filter(Boolean))].sort((a,b) => a.localeCompare(b));
  const suggestions = [...new Set(rows.flatMap(row => [row.driver,row.barangay,row.truckPlate].map(historyText)))].filter(value => value && value.toLowerCase().includes(query.trim().toLowerCase())).slice(0,5);
  return <View style={styles.filters}>
    <Input accessibilityLabel="Search submission history" placeholder="Search driver, area or truck..." value={query} onChangeText={text => update(text)} onFocus={() => setFocused(true)} style={styles.input} />
    {focused && query.trim() ? <View>{suggestions.map(text => <Button key={text} variant="ghost" onPress={() => {update(text); setFocused(false);}}><Button.Label>{text}</Button.Label></Button>)}</View> : null}
    <View style={styles.filterGrid}>{(['Driver','Area','Truck','Sync status'] as const).map((label,index) => <View style={styles.filterCell} key={label}><StaffSearchSelect label={label} value={filters[index] || '__all__'} options={[{value:'__all__',label:`All ${label.toLowerCase()}`},...values((['driver','barangay','truckPlate','status'] as const)[index]).map(value => ({value,label:value}))]} onChange={value => {const next=[...filters];next[index]=value === '__all__' ? '' : value;update(query,next);}} /></View>)}</View>
    {query || filters.some(Boolean) ? <Button variant="ghost" onPress={() => update('', ['','','',''])}><Button.Label>Clear filters</Button.Label></Button> : null}
  </View>;
}
const styles=StyleSheet.create({
 field:{marginTop:16},label:{color:'#35463F',fontSize:13,fontWeight:'600',marginBottom:6},title:{color:'#121A16',fontSize:20,fontWeight:'700'},
 trigger:{minHeight:52,borderRadius:16,backgroundColor:'#F1F5F3',flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:14},value:{flex:1,color:'#121A16',fontSize:16},
 input:{backgroundColor:'#F1F5F3',borderRadius:14,minHeight:48,color:'#121A16'},hint:{color:'#5A6761',fontSize:12,lineHeight:18,marginVertical:8},error:{color:'#B3261E',fontSize:12,marginTop:8},
 overlay:{flex:1,justifyContent:'center'},dialog:{maxHeight:'75%',borderRadius:24,padding:16,backgroundColor:'white'},heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12},options:{flexGrow:0,marginTop:8},
 range:{flexDirection:'row',justifyContent:'space-between',marginBottom:12},filters:{marginBottom:16},filterGrid:{flexDirection:'row',flexWrap:'wrap',gap:12},filterCell:{flexBasis:'45%',flexGrow:1,minWidth:130},
});