import { darkPalette } from '@/constants/mobile-palette';
import { useThemedStyles, useThemeColor } from '@/hooks/use-themed-styles';
import { useAppTheme } from '@/hooks/app-preferences';
import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, TextInput, View, ActivityIndicator } from 'react-native';
import { Feather } from 'expo/node_modules/@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text } from './app-text';
import { MotionModal, MotionPressable as Pressable } from './app-motion';
import { BarangayPicker } from './barangay-picker';
import { ResidentAvatar } from './resident-avatar';
import { ChangePasswordModal } from './resident-settings-modal';
import type { AuthSession } from '@/lib/session';
type Props = { session: AuthSession; apiUrl: string; name: string; phone: string; location: string; photo: ImagePicker.ImagePickerAsset | null; removed: boolean; busy: boolean; error: string; setName: (v:string)=>void; setPhone:(v:string)=>void; setLocation:(v:string)=>void; setPhoto:(v:ImagePicker.ImagePickerAsset|null)=>void; setRemoved:(v:boolean)=>void; save:()=>void; close:()=>void };
export function ResidentProfileEditor(p: Props) {
  const themeColor = useThemeColor();
  const s = useS();
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const isDark = appTheme === 'dark';
  const scroll = useRef<ScrollView>(null);
  const locationY = useRef(0);
  const searchingLocation = useRef(false);
  const revealLocation = () => {
    if (searchingLocation.current) scroll.current?.scrollTo({ y: Math.max(0, locationY.current - 12), animated: true });
  };
  const focusLocation = () => {
    searchingLocation.current = true;
    requestAnimationFrame(revealLocation);
  };

  const [sheet, setSheet] = useState(false);
  const [picking, setPicking] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [denied, setDenied] = useState(false);
  const [focus, setFocus] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordSet, setPasswordSet] = useState(true);
  const [passwordReady, setPasswordReady] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const uri = p.photo?.uri || (p.removed ? undefined : p.session.user.profilePhotoUrl);
  const dirty = p.name.trim() !== (p.session.user.name || '') || p.phone.trim() !== (p.session.user.phone || '') || p.location.trim() !== (p.session.user.location || p.session.user.barangay || '') || !!p.photo || (p.removed && !!p.session.user.profilePhotoUrl);
  const busy = p.busy || picking;
  const close = () => {
    if (busy) return;
    if (dirty) Alert.alert('Discard changes?', 'Your unsaved profile changes will be lost.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: p.close }]);
    else p.close();
  };
  useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; }); return () => sub.remove(); });
  const openPassword = async () => {
    setPasswordError('');
    try {
      const response = await fetch(`${p.apiUrl}/auth/settings`, { headers: { Authorization: `Bearer ${p.session.token}` } });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error('Unable to load password settings. Please try again online.');
      setPasswordSet(result.data.isPasswordSet !== false); setPasswordReady(true); setPasswordOpen(true);
    } catch (e) { setPasswordError(e instanceof Error ? e.message : 'Unable to load password settings.'); }
  };
  const pick = async (camera: boolean) => {
    setSheet(false); setPicking(true); setPhotoError(''); setDenied(false);
    try {
      const permission = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { setDenied(true); throw new Error(camera ? 'Camera access is needed to take a photo.' : 'Photo access is needed to choose a photo.'); }
      const options: ImagePicker.ImagePickerOptions = { allowsEditing: true, aspect: [1, 1], mediaTypes: ['images'], quality: 0.8 };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (asset.type && asset.type !== 'image') throw new Error('Please choose an image.');
      if ((asset.fileSize || 0) > 5 * 1024 * 1024) throw new Error('Choose an image smaller than 5 MB.');
      const context = ImageManipulator.ImageManipulator.manipulate(asset.uri);
      const edge = Math.min(asset.width, asset.height);
      context.crop({ originX: (asset.width - edge) / 2, originY: (asset.height - edge) / 2, width: edge, height: edge });
      context.resize({ width: 512, height: 512 });
      const rendered = await context.renderAsync();
      try {
        const saved = await rendered.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.75 });
        const file = Platform.OS === 'web' ? await (await fetch(saved.uri)).blob() : undefined;
        const info = Platform.OS !== 'web' ? await FileSystem.getInfoAsync(saved.uri) : undefined;
        const size = file?.size || (info && info.exists && 'size' in info ? info.size : 0);
        if (size > 1024 * 1024) throw new Error('This image is too large. Please choose a smaller photo.');
        p.setPhoto({ ...asset, ...saved, mimeType: 'image/jpeg', fileName: 'profile.jpg', file: undefined, fileSize: size }); p.setRemoved(false);
      } finally { rendered.release(); context.release(); }
    } catch (e) { setPhotoError(e instanceof Error ? e.message : 'Unable to prepare this photo.'); }
    finally { setPicking(false); }
  };
  const field = (label:string, key:string, value:string, change:(v:string)=>void, icon:'user'|'phone') => <View style={s.field}>
    <Text style={[s.label, isDark && { color: '#B4C4BB' }]}>{label}</Text><View style={[s.inputWrap, isDark && { backgroundColor: '#21372C', borderColor: '#34443C' }, focus === key && (isDark ? { backgroundColor: '#192A22', borderColor: themeColor('#55C58C', darkPalette.border) } : s.focus), key === 'name' && p.error === 'Name is required.' && s.invalid]}>
      <Feather name={icon} size={20} color={themeColor("#5A6761", darkPalette.muted)}/><TextInput accessibilityLabel={label} editable={!busy} value={value} onChangeText={change} onFocus={()=>{searchingLocation.current=false;setFocus(key);}} onBlur={()=>setFocus('')} keyboardType={key === 'phone' ? 'phone-pad' : 'default'} autoCapitalize={key === 'name' ? 'words' : 'none'} style={[s.input, isDark && { color: '#F1F6F3' }]} placeholderTextColor={isDark ? themeColor('#7E9187', darkPalette.muted) : themeColor('#5A6761', darkPalette.muted)} selectionColor={isDark ? '#55C58C' : '#0A7F4F'}/>
    </View>{key === 'name' && p.error === 'Name is required.' ? <Text style={s.error}>{p.error}</Text> : null}</View>;
  return <KeyboardAvoidingView style={[s.screen, isDark && { backgroundColor: '#101815' }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={[s.header, {paddingTop: Math.max(insets.top, 44) + 8}]}><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={close} disabled={busy} style={s.back}><Feather name="chevron-left" size={28} color={themeColor("#086B42", darkPalette.accent)}/></Pressable><Text accessibilityRole="header" style={[s.title, isDark && { color: '#F1F6F3' }]}>Edit profile</Text></View>
    <ScrollView ref={scroll} style={s.scroll} keyboardShouldPersistTaps="handled" onLayout={revealLocation} onContentSizeChange={revealLocation} contentContainerStyle={s.body}>
      <View style={s.photoBlock}><Pressable accessibilityRole="button" accessibilityLabel="Change profile photo" disabled={busy} onPress={()=>setSheet(true)}><ResidentAvatar uri={uri} name={p.name} size={112}/><View style={s.camera}><Feather name="camera" size={20} color="white"/></View></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={()=>setSheet(true)} style={s.change}><Text style={s.changeText}>{picking ? 'Preparing photo...' : 'Change photo'}</Text></Pressable></View>
      {photoError ? <Text accessibilityRole="alert" style={s.error}>{photoError}</Text> : null}{denied ? <Pressable onPress={()=>Linking.openSettings()} style={s.change}><Text style={s.changeText}>Open settings</Text></Pressable> : null}
      {field('Full name','name',p.name,p.setName,'user')}{field('Phone number','phone',p.phone,p.setPhone,'phone')}
      <View onLayout={event=>{locationY.current=event.nativeEvent.layout.y;}} style={s.field}><Text style={[s.label, isDark && { color: '#B4C4BB' }]}>Collection location</Text><View pointerEvents={busy ? 'none' : 'auto'}><BarangayPicker appearance="profile" value={p.location} onChange={p.setLocation} onSearchFocus={focusLocation} onSearchBlur={()=>{searchingLocation.current=false;}}/></View></View>
      <Pressable accessibilityRole="button" disabled={busy} onPress={openPassword} style={s.password}><Feather name="lock" size={20} color={themeColor("#086B42", darkPalette.accent)}/><Text style={s.changeText}>Change password</Text><Feather name="chevron-right" size={20} color={themeColor("#086B42", darkPalette.accent)}/></Pressable>
      <Text style={[s.hint, isDark && { color: themeColor('#7E9187', darkPalette.muted) }]}>Password changes are saved separately.</Text>{passwordError ? <Text accessibilityRole="alert" style={s.error}>{passwordError}</Text> : null}
      {p.error && p.error !== 'Name is required.' ? <Text accessibilityRole="alert" style={s.error}>{p.error === 'No valid fields to update' && p.photo ? 'The profile service did not accept the photo upload. It needs the profile-photo server update before this can be saved.' : p.error} Your changes are kept here.</Text> : null}
    <View style={[s.footer, isDark && { borderTopColor: '#203228' }, {paddingBottom:Math.max(28,insets.bottom)}]}><Pressable accessibilityRole="button" disabled={busy} onPress={close} style={[s.cancel, isDark && { borderColor: '#34443C', backgroundColor: '#192A22' }]}><Text style={[s.cancelText, isDark && { color: '#F1F6F3' }]}>Cancel</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Save changes" accessibilityState={{disabled: !dirty || busy}} disabled={!dirty || busy} onPress={p.save} style={[s.save,(!dirty || busy) && {opacity:0.5}]}>{p.busy ? <ActivityIndicator color="white"/> : <Text style={s.saveText}>Save changes</Text>}</Pressable></View>
    </ScrollView>
    <MotionModal transparent visible={sheet} animationType="slide" onRequestClose={()=>setSheet(false)}><View style={s.backdrop}><Pressable accessibilityLabel="Close photo options" onPress={()=>setSheet(false)} style={StyleSheet.absoluteFill}/><View style={[s.sheet, isDark && { backgroundColor: '#192A22' }, {paddingBottom:Math.max(24,insets.bottom)}]}><View style={[s.handle, isDark && { backgroundColor: '#34443C' }]}/><Text style={[s.sheetTitle, isDark && { color: '#F1F6F3' }]}>Profile photo</Text>{([{label:'Take photo',icon:'camera',action:()=>pick(true)},{label:'Choose from gallery',icon:'image',action:()=>pick(false)},...(uri ? [{label:'Remove photo',icon:'trash-2',action:()=>{p.setPhoto(null);p.setRemoved(true);setSheet(false);setPhotoError('');}}] : [])]).map(row=><Pressable accessibilityRole="button" key={row.label} onPress={row.action} style={s.option}><View style={[s.badge,row.icon==='trash-2' && {backgroundColor:themeColor('#FDECEA', darkPalette.dangerTint)}]}><Feather name={row.icon as 'camera'} size={20} color={row.icon==='trash-2' ? themeColor('#B3261E', darkPalette.danger):themeColor('#0A7F4F', darkPalette.accent)}/></View><Text style={[s.optionText, isDark && { color: '#F1F6F3' }, row.icon==='trash-2' && {color:themeColor('#B3261E', darkPalette.danger)}]}>{row.label}</Text></Pressable>)}<Pressable accessibilityRole="button" onPress={()=>setSheet(false)} style={[s.sheetCancel, isDark && { backgroundColor: '#21372C' }]}><Text style={[s.cancelText, isDark && { color: '#F1F6F3' }]}>Cancel</Text></Pressable></View></View></MotionModal>
    {passwordReady ? <ChangePasswordModal visible={passwordOpen} onClose={()=>setPasswordOpen(false)} apiUrl={p.apiUrl} token={p.session.token} isPasswordSet={passwordSet}/> : null}
  </KeyboardAvoidingView>;
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:'white'},header:{flexDirection:'row',alignItems:'center',paddingRight:20,paddingLeft:8,paddingBottom:8,gap:8},back:{width:44,height:44,alignItems:'center',justifyContent:'center'},title:{fontSize:24,fontWeight:'700',color:'#121A16',flexShrink:1},scroll:{flex:1,minHeight:0},body:{paddingHorizontal:20,paddingBottom:8},photoBlock:{alignItems:'center',paddingTop:24,paddingBottom:24},camera:{position:'absolute',right:0,bottom:0,width:40,height:40,borderRadius:20,borderWidth:3,borderColor:'white',backgroundColor:'#0A7F4F',alignItems:'center',justifyContent:'center'},change:{minHeight:44,justifyContent:'center',marginTop:8},changeText:{fontSize:15,fontWeight:'600',color:'#086B42'},field:{marginBottom:20},label:{fontSize:14,fontWeight:'600',color:'#35463F',marginBottom:8},inputWrap:{minHeight:56,borderRadius:16,backgroundColor:'#F1F5F3',borderWidth:2,borderColor:'transparent',flexDirection:'row',alignItems:'center',paddingHorizontal:16,gap:14},focus:{backgroundColor:'white',borderColor:'#0A7F4F'},invalid:{borderColor:'#B3261E'},input:{flex:1,minWidth:0,fontSize:16,color:'#121A16',paddingVertical:14},error:{fontSize:12,color:'#B3261E',marginTop:8,marginBottom:8},hint:{fontSize:12,color:'#5A6761',marginTop:4},password:{minHeight:52,flexDirection:'row',alignItems:'center',gap:12},footer:{flexDirection:'row',gap:12,marginTop:24,paddingTop:12,borderTopWidth:1,borderTopColor:'#E3EAE6'},cancel:{flex:1,minHeight:52,borderRadius:16,borderWidth:1.5,borderColor:'#D5DDD9',alignItems:'center',justifyContent:'center',padding:8},save:{flex:1.4,minHeight:52,borderRadius:16,backgroundColor:'#0A7F4F',alignItems:'center',justifyContent:'center',padding:8},cancelText:{fontSize:16,fontWeight:'600',color:'#121A16',textAlign:'center'},saveText:{fontSize:16,fontWeight:'700',color:'white',textAlign:'center'},backdrop:{flex:1,backgroundColor:'rgba(13,30,24,0.5)',justifyContent:'flex-end'},sheet:{backgroundColor:'white',borderTopLeftRadius:28,borderTopRightRadius:28,paddingHorizontal:20,paddingTop:10},handle:{width:40,height:4,borderRadius:2,backgroundColor:'#C9D3CE',alignSelf:'center',marginBottom:20},sheetTitle:{fontSize:20,fontWeight:'700',color:'#121A16',marginBottom:12},option:{minHeight:60,flexDirection:'row',alignItems:'center',gap:16,paddingVertical:8},badge:{width:40,height:40,borderRadius:20,backgroundColor:'#E3F4EB',alignItems:'center',justifyContent:'center'},optionText:{fontSize:16,fontWeight:'600',color:'#121A16',flexShrink:1},sheetCancel:{minHeight:52,borderRadius:16,backgroundColor:'#F1F5F3',alignItems:'center',justifyContent:'center',marginTop:16,padding:8}});

// Explicit dark surface and foreground pairs; the light layout stays unchanged.
const darkStyles = {
  screen: { backgroundColor: darkPalette.surface },
  title: { color: darkPalette.text },
  camera: { borderColor: darkPalette.border },
  changeText: { color: darkPalette.accent },
  label: { color: darkPalette.text },
  inputWrap: { backgroundColor: darkPalette.field },
  focus: { backgroundColor: darkPalette.surface },
  input: { color: darkPalette.text },
  error: { color: darkPalette.danger },
  hint: { color: darkPalette.muted },
  footer: { borderTopColor: darkPalette.border },
  cancel: { borderColor: darkPalette.border },
  cancelText: { color: darkPalette.text },
  sheet: { backgroundColor: darkPalette.surface },
  handle: { backgroundColor: darkPalette.field },
  sheetTitle: { color: darkPalette.text },
  badge: { backgroundColor: darkPalette.tint },
  optionText: { color: darkPalette.text },
  sheetCancel: { backgroundColor: darkPalette.field },
};
function useS() {
  return useThemedStyles(s, darkStyles);
}
