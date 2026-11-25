import { darkPalette } from '@/constants/mobile-palette';
import { useThemeColor } from '@/hooks/use-themed-styles';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { ResidentProfileEditor } from './resident-profile-editor';
import { AppText as Text } from './app-text';
import { MotionPressable as Pressable } from './app-motion';
import { getSession, saveSession, type AuthSession } from '@/lib/session';
export function WorkProfileEditor({ onClose, onSaved }: { onClose:()=>void; onSaved:(session:AuthSession)=>void }) {
  const themeColor = useThemeColor();
  const [session,setSession]=useState<AuthSession|null>(null);
  const [name,setName]=useState(''),[phone,setPhone]=useState(''),[location,setLocation]=useState('');
  const [photo,setPhoto]=useState<ImagePickerAsset|null>(null),[removed,setRemoved]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const apiUrl=process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/,'') || '';
  useEffect(()=>{let active=true;void (async()=>{
    try {
      let current=await getSession();
      if(!current) throw new Error('Please sign in again.');
      try {const response=await fetch(`${apiUrl}/auth/me`,{headers:{Authorization:`Bearer ${current.token}`}});const result=await response.json();if(response.ok&&result.success&&result.data)current={...current,user:result.data};} catch { /* Cached account stays editable offline; save errors retain the draft. */ }
      if(!active)return;
      const user={...current.user,phone:current.user.phone ?? current.user.contact ?? ''};
      setSession({...current,user});setName(user.name||'');setPhone(user.phone);setLocation(user.location||user.barangay||'');
    }catch(e){if(active)setError(e instanceof Error?e.message:'Unable to load profile.');}
  })();return()=>{active=false;};},[apiUrl]);
  const save=async()=>{
    if(!session||busy)return;
    if(!name.trim()){setError('Name is required.');return;}
    if(!apiUrl){setError('Profile service is not configured.');return;}
    setBusy(true);setError('');
    try {
      const fields={name:name.trim(),phone:phone.trim(),location:location.trim(),...(removed?{profilePhotoUrl:''}:{})};
      const headers:Record<string,string>={Authorization:`Bearer ${session.token}`};
      let body:string|FormData=JSON.stringify(fields);
      if(photo){const form=new FormData();Object.entries(fields).forEach(([key,value])=>form.append(key,value));
        if(Platform.OS==='web')form.append('avatar',photo.file||await(await fetch(photo.uri)).blob(),photo.fileName||'profile.jpg');
        else form.append('avatar',{uri:photo.uri,name:photo.fileName||'profile.jpg',type:photo.mimeType||'image/jpeg'} as unknown as Blob);
        body=form;
      }else headers['Content-Type']='application/json';
      const response=await fetch(`${apiUrl}/auth/me`,{method:'PATCH',headers,body});const result=await response.json();
      if(!response.ok||!result.success||!result.data)throw new Error(result.error||'Unable to save your profile.');
      const updated={token:session.token,user:result.data};await saveSession(updated);onSaved(updated);onClose();
    }catch(e){setError(e instanceof Error?e.message:'Unable to save your profile.');}finally{setBusy(false);}
  };
  if(!session)return <View style={{flex:1,padding:24,justifyContent:'center',backgroundColor:themeColor('white', darkPalette.surface)}}>{error?<Text accessibilityRole="alert">{error}</Text>:<ActivityIndicator color={themeColor("#0A7F4F", darkPalette.accent)}/>}<Pressable onPress={onClose} accessibilityRole="button" style={{padding:20}}><Text>Back to profile</Text></Pressable></View>;
  return <ResidentProfileEditor session={session} apiUrl={apiUrl} name={name} phone={phone} location={location} photo={photo} removed={removed} busy={busy} error={error} setName={setName} setPhone={setPhone} setLocation={setLocation} setPhoto={setPhoto} setRemoved={setRemoved} save={save} close={onClose}/>;
}
