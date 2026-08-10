import { SafeAreaView, StyleSheet, Text } from 'react-native';

export default function CollectorScreen() {
  return <SafeAreaView style={styles.container}><Text style={styles.text}>Welcome, Collector</Text></SafeAreaView>;
}

const styles = StyleSheet.create({ container: { alignItems: 'center', flex: 1, justifyContent: 'center' }, text: { fontSize: 24, fontWeight: '600' } });
