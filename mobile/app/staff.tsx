import { SafeAreaView, StyleSheet, Text } from 'react-native';

export default function StaffScreen() {
  return <SafeAreaView style={styles.container}><Text style={styles.text}>Welcome, Staff</Text></SafeAreaView>;
}

const styles = StyleSheet.create({ container: { alignItems: 'center', flex: 1, justifyContent: 'center' }, text: { fontSize: 24, fontWeight: '600' } });
