import { useRef, useState } from 'react';
import { Keyboard, PanResponder, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { Feather } from 'expo/node_modules/@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MotionModal, MotionPressable as Pressable } from '@/components/app-motion';
import { AppSelect } from '@/components/app-select';
import { Button, Input, Slider } from 'heroui-native';
import { AppText as Text } from '@/components/app-text';
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
  const searchInput = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(['', '', '', '']);
  const { height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const update = (text: string, next = filters) => onChange(text, next[0], next[1], next[2], next[3]);
  const values = (key: keyof RecordRow) => [...new Set(rows.map(row => historyText(row[key])).filter(Boolean))].sort((a,b) => a.localeCompare(b));
  const suggestions = [...new Set(rows.flatMap(row => [row.driver,row.barangay,row.truckPlate].map(historyText)))].filter(value => value && value.toLowerCase().includes(query.trim().toLowerCase())).slice(0,5);
  const fields = [
    { label: 'Driver', chip: 'Driver', key: 'driver', all: 'All drivers', icon: 'user' },
    { label: 'Area', chip: 'Area', key: 'barangay', all: 'All areas', icon: 'map-pin' },
    { label: 'Truck', chip: 'Truck', key: 'truckPlate', all: 'All trucks', icon: 'truck' },
    { label: 'Sync status', chip: 'Sync', key: 'status', all: 'All statuses', icon: 'refresh-cw' },
  ] as const;
  const activeCount = filters.filter(Boolean).length;
  const resultCount = filterStaffHistory(rows, query, draft[0], draft[1], draft[2], draft[3]).length;
  const dismiss = () => setOpen(false);
  const drag = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 8 && gesture.dy > Math.abs(gesture.dx),
    onPanResponderRelease: (_, gesture) => { if (gesture.dy > 60 || (gesture.dy > 20 && gesture.vy > 0.7)) dismiss(); },
  });
  return <View style={styles.filters}>
    <View style={styles.searchRow}>
      <View style={styles.historySearch}>
        <Feather name="search" size={20} color="#5A6761" />
        <TextInput ref={searchInput} accessibilityLabel="Search submission history" placeholder="Search driver, area or truck…" placeholderTextColor="#5A6761" value={query} onChangeText={text => update(text)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} returnKeyType="search" style={[styles.historySearchInput, { minHeight: Math.max(48, 15 * fontScale * 1.4 + 16) }]} />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={activeCount ? `Filters, ${activeCount} active` : 'Filters'} accessibilityState={{expanded:open}} onPress={() => { searchInput.current?.blur(); Keyboard.dismiss(); setFocused(false); setDraft([...filters]); setOpen(true); }} style={[styles.filterButton, activeCount > 0 && styles.filterButtonActive]}>
        <Feather name="filter" size={22} color={activeCount ? '#086B42' : '#35463F'}/>
        {activeCount > 0 ? <View style={styles.filterBadge}><Text allowFontScaling={false} style={styles.filterBadgeText}>{activeCount}</Text></View> : null}
      </Pressable>
    </View>
    {focused && query.trim() ? <View>{suggestions.map(text => <Button key={text} variant="ghost" onPress={() => {update(text); setFocused(false); Keyboard.dismiss();}}><Button.Label>{text}</Button.Label></Button>)}</View> : null}
    {activeCount > 0 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={styles.chipScroll} contentContainerStyle={styles.chips}>
      {fields.map((field,index) => filters[index] ? <View key={field.key} style={styles.filterChip}>
        <Text numberOfLines={1} ellipsizeMode="tail" style={styles.filterChipText}>{field.chip}: {filters[index]}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${field.label} filter: ${filters[index]}`} hitSlop={6} onPress={() => update(query, filters.map((item,i) => i === index ? '' : item))} style={styles.removeChip}><Feather name="x" size={16} color="#086B42"/></Pressable>
      </View> : null)}
      <Pressable accessibilityRole="button" onPress={() => update(query, ['', '', '', ''])} style={styles.clearAll}><Text style={styles.clearAllText}>Clear all</Text></Pressable>
    </ScrollView> : null}
    <MotionModal visible={open} transparent statusBarTranslucent animationType="slide" onRequestClose={dismiss}>
      <View style={styles.sheetRoot}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close filters without applying" onPress={dismiss} style={styles.sheetBackdrop}/>
        <View accessibilityViewIsModal onAccessibilityEscape={dismiss} style={[styles.sheet, {maxHeight:height - insets.top - 16, paddingBottom:Math.max(24,insets.bottom)}]}>
          <View {...drag.panHandlers}>
            <View accessible={false} style={styles.dragHandle}/>
            <View style={styles.sheetHeading}>
              <Text accessibilityRole="header" style={styles.sheetTitle}>Filters</Text>
              <Pressable accessibilityRole="button" onPress={() => setDraft(['', '', '', ''])} style={styles.resetButton}><Text style={styles.resetText}>Reset</Text></Pressable>
            </View>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.sheetFields} contentContainerStyle={styles.sheetFieldsContent}>
            {fields.map((field,index) => {
              const options = [{value:'__all__',label:field.all}, ...values(field.key).map(value => ({value,label:value}))];
              return <AppSelect key={field.key} appearance="staff-filter" label={field.label} leadingIcon={field.icon} value={draft[index] || '__all__'} options={options} searchable={options.length > 6} onChange={value => setDraft(previous => previous.map((item,i) => i === index ? value === '__all__' ? '' : value : item))}/>;
            })}
          </ScrollView>
          <Pressable accessibilityRole="button" accessibilityState={{disabled:resultCount === 0}} disabled={resultCount === 0} onPress={() => { update(query,draft); dismiss(); }} style={[styles.showResults, resultCount === 0 && styles.noResults]}>
            <Text style={styles.showResultsText}>{resultCount ? `Show ${resultCount} results` : 'No results'}</Text>
          </Pressable>
        </View>
      </View>
    </MotionModal>
  </View>;
}
const styles=StyleSheet.create({
 field:{marginTop:16},label:{color:'#35463F',fontSize:13,fontWeight:'600',marginBottom:6},title:{color:'#121A16',fontSize:20,fontWeight:'700'},
 trigger:{minHeight:52,borderRadius:16,backgroundColor:'#F1F5F3',flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:14},value:{flex:1,color:'#121A16',fontSize:16},
 input:{backgroundColor:'#F1F5F3',borderRadius:14,minHeight:48,color:'#121A16'},hint:{color:'#5A6761',fontSize:12,lineHeight:18,marginVertical:8},error:{color:'#B3261E',fontSize:12,marginTop:8},
 overlay:{flex:1,justifyContent:'center'},dialog:{maxHeight:'75%',borderRadius:24,padding:16,backgroundColor:'white'},heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12},options:{flexGrow:0,marginTop:8},
 range:{flexDirection:'row',justifyContent:'space-between',marginBottom:12},filters:{marginBottom:16},
 searchRow:{flexDirection:'row',alignItems:'center',gap:10},
 historySearch:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:10,paddingLeft:16,paddingRight:12,backgroundColor:'#F1F5F3',borderRadius:14},
 historySearchInput:{flex:1,minWidth:0,color:'#121A16',fontSize:15,paddingVertical:12,paddingHorizontal:0},
 filterButton:{width:48,height:48,borderRadius:14,backgroundColor:'#F1F5F3',alignItems:'center',justifyContent:'center'},filterButtonActive:{backgroundColor:'#E3F4EB'},
 filterBadge:{position:'absolute',right:-4,top:-5,minWidth:20,height:20,paddingHorizontal:4,borderRadius:10,borderWidth:2,borderColor:'white',backgroundColor:'#0A7F4F',alignItems:'center',justifyContent:'center'},filterBadgeText:{fontSize:11,fontWeight:'700',color:'white',lineHeight:14},
 chipScroll:{marginTop:12},chips:{alignItems:'center',gap:8,paddingRight:4},filterChip:{minHeight:36,maxWidth:280,paddingLeft:12,paddingRight:6,paddingVertical:4,borderRadius:10,backgroundColor:'#E3F4EB',flexDirection:'row',alignItems:'center',gap:6},filterChipText:{flexShrink:1,color:'#086B42',fontSize:13,fontWeight:'600'},removeChip:{width:24,height:24,alignItems:'center',justifyContent:'center'},clearAll:{minHeight:36,justifyContent:'center',paddingHorizontal:8},clearAllText:{fontSize:13,fontWeight:'600',color:'#086B42'},
 sheetRoot:{flex:1,justifyContent:'flex-end'},sheetBackdrop:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(13,30,24,0.5)'},sheet:{backgroundColor:'white',borderTopLeftRadius:28,borderTopRightRadius:28,paddingTop:10,paddingHorizontal:20},dragHandle:{width:40,height:4,borderRadius:2,backgroundColor:'#C9D3CE',alignSelf:'center',marginBottom:12},sheetHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:16},sheetTitle:{fontSize:22,fontWeight:'700',color:'#121A16'},resetButton:{minHeight:44,justifyContent:'center',paddingLeft:16},resetText:{fontSize:15,fontWeight:'600',color:'#086B42'},sheetFields:{flexShrink:1},sheetFieldsContent:{gap:16,paddingBottom:4},showResults:{minHeight:56,paddingVertical:14,paddingHorizontal:16,borderRadius:18,backgroundColor:'#0A7F4F',alignItems:'center',justifyContent:'center',marginTop:24},showResultsText:{fontSize:17,fontWeight:'700',color:'white'},noResults:{opacity:0.45},
});