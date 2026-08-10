import { SafeAreaView, StyleSheet, Text } from 'react-native';

export default function ResidentScreen() {
  return <SafeAreaView style={styles.container}><Text style={styles.text}>Welcome, Resident</Text></SafeAreaView>;
}

const styles = StyleSheet.create({ container: { alignItems: 'center', flex: 1, justifyContent: 'center' }, text: { fontSize: 24, fontWeight: '600' } });
