import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, View, TextInput, useWindowDimensions } from 'react-native';
import { Input } from 'heroui-native';
import { Feather } from 'expo/node_modules/@expo/vector-icons';
import { AppText as Text } from '@/components/app-text';
import type { AppSelectOption } from '@/components/app-select';

/** The field itself is the search input; suggestions stay in the form's scroll flow. */
export function SearchableSelect({ label = 'Select option', value, options, onChange, placeholder = 'Select one', disabled = false, leadingIcon = 'search', appearance = 'staff', invalid = false, hideLabel = false, onSearchFocus, onSearchBlur }: {
  appearance?: 'staff' | 'auth' | 'default' | 'profile'; invalid?: boolean; hideLabel?: boolean;
  label?: string; value: string; options: AppSelectOption[]; onChange: (value: string) => void;
  placeholder?: string; disabled?: boolean; leadingIcon?: ComponentProps<typeof Feather>['name']; onSearchFocus?:()=>void; onSearchBlur?:()=>void;
}) {
  const selected = options.find(option => option.value === value)?.label || value;
  const [query, setQuery] = useState(selected);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const input = useRef<TextInput>(null);
  const { fontScale } = useWindowDimensions();
  useEffect(() => { if (!open) setQuery(selected); }, [selected, open]);
  const matches = options.filter(option => !searching || `${option.label} ${option.description || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const close = () => { onSearchBlur?.(); setOpen(false); setSearching(false); setQuery(selected); };
  return <View style={[styles.root, appearance === 'staff' && {marginTop:16}]}>
    {!hideLabel ? <Text style={styles.label}>{label}</Text> : null}
    <View style={[styles.field, {minHeight:Math.max(56,16*fontScale*1.4+20)},open && styles.focus,invalid && styles.invalid,disabled && {opacity:0.55}]}>
      <Feather name={leadingIcon} size={20} color="#5A6761"/>
      <Input ref={input} accessibilityLabel={label} accessibilityState={{expanded:open,disabled}} editable={!disabled} isDisabled={disabled} background={null} value={query} placeholder={placeholder} placeholderTextColor="#5A6761" selectTextOnFocus autoCorrect={false} style={styles.input}
        onFocus={()=>{setOpen(true);setSearching(false);onSearchFocus?.();}}
        onBlur={close}
        onChangeText={text=>{setQuery(text);setSearching(true);setOpen(true);if(value)onChange('');}}
        returnKeyType="done" onSubmitEditing={()=>{if(matches.length===1){onSearchBlur?.();onChange(matches[0].value);setQuery(matches[0].label);setOpen(false);input.current?.blur();}}}/>
      <Pressable accessibilityRole="button" accessibilityLabel={open ? `Close ${label}` : `Search ${label}`} disabled={disabled} onPress={()=>{if(open){input.current?.blur();close();}else input.current?.focus();}} style={styles.arrow}><Feather name={open?'chevron-up':'chevron-down'} size={22} color="#5A6761"/></Pressable>
    </View>
    {open && !disabled ? <View style={styles.panel}><ScrollView nestedScrollEnabled keyboardShouldPersistTaps="always" style={{maxHeight:220}}>
      {matches.map(option=><Pressable key={option.value} accessibilityRole="button" accessibilityLabel={option.label} accessibilityState={{selected:option.value===value}} onPress={()=>{onSearchBlur?.();onChange(option.value);setQuery(option.label);setSearching(false);setOpen(false);Keyboard.dismiss();}} style={[styles.option,option.value===value && styles.selected]}><View style={{flex:1}}><Text style={styles.optionText}>{option.label}</Text>{option.description?<Text style={styles.description}>{option.description}</Text>:null}</View>{option.value===value?<Feather name="check" size={20} color="#0A7F4F"/>:null}</Pressable>)}
      {!matches.length?<Text style={styles.empty}>No matching options</Text>:null}
    </ScrollView></View>:null}
  </View>;
}
const styles=StyleSheet.create({root:{alignSelf:'stretch',width:'100%'},label:{color:'#35463F',fontSize:14,fontWeight:'600',marginBottom:8},field:{borderRadius:16,backgroundColor:'#F1F5F3',borderWidth:2,borderColor:'transparent',flexDirection:'row',alignItems:'center',gap:12,paddingLeft:16},focus:{backgroundColor:'white',borderColor:'#0A7F4F'},invalid:{borderColor:'#B3261E'},input:{flex:1,minWidth:0,paddingHorizontal:0,paddingVertical:12,color:'#121A16',fontSize:16,backgroundColor:'transparent',borderWidth:0,boxShadow:'none'},arrow:{width:44,minHeight:48,alignItems:'center',justifyContent:'center'},panel:{marginTop:6,padding:6,borderRadius:16,borderWidth:1,borderColor:'#D5DDD9',backgroundColor:'#FFFFFF',overflow:'hidden'},option:{minHeight:52,paddingHorizontal:12,paddingVertical:10,borderRadius:12,flexDirection:'row',alignItems:'center',gap:8},selected:{backgroundColor:'#E3F4EB'},optionText:{color:'#121A16',fontSize:15,fontWeight:'500'},description:{color:'#5A6761',fontSize:12,marginTop:3},empty:{color:'#5A6761',fontSize:14,padding:14}});
