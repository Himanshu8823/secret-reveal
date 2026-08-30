import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { colors } from '../../../src/theme';
export default function InvitesRedirect() {
  useEffect(() => { router.replace('/(app)/create/groups'); }, []);
  return <View style={{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor: '#fff' }}><ActivityIndicator color={colors.brand.primary} /></View>;
}
