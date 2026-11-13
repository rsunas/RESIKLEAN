import { useState } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
export function ResidentAvatar({ uri, name = '', size = 56 }: { uri?: string; name?: string; size?: number }) {
  const [failed, setFailed] = useState<string>();
  return <LinearGradient colors={['#24846E', '#0D2E27']} style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: 'white', fontWeight: '700', fontSize: size * 0.39 }}>{name.trim().charAt(0).toUpperCase() || 'R'}</Text>
    {uri && failed !== uri ? <View style={{ position: 'absolute', inset: 0 }}><Image source={{ uri }} accessibilityLabel="Profile photo" contentFit="cover" cachePolicy="memory-disk" onError={() => setFailed(uri)} style={{ width: size, height: size }} /></View> : null}
  </LinearGradient>;
}
