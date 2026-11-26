import { Image, Linking, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { C } from '../theme';

export function Logo({ uri, size = 32 }: { uri: string; size?: number }) {
  return <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="contain" />;
}

export function ProbBar({ home, homeColor = C.red, awayColor = C.blue }: { home: number; homeColor?: string; awayColor?: string }) {
  return (
    <View style={s.bar}>
      <View style={{ flex: 1 - home, backgroundColor: awayColor }} />
      <View style={{ width: 2, backgroundColor: C.bg }} />
      <View style={{ flex: home, backgroundColor: homeColor }} />
    </View>
  );
}

export function Pill({ text, color = C.blue, style }: { text: string; color?: string; style?: ViewStyle }) {
  return (
    <View style={[s.pill, { borderColor: color }, style]}>
      <Text style={[s.pillText, { color }]}>{text}</Text>
    </View>
  );
}

export function OpenButton({ label, url, color = C.kalshi, small }: { label: string; url: string | null; color?: string; small?: boolean }) {
  if (!url) return null;
  return (
    <Pressable
      onPress={() => Linking.openURL(url)}
      style={({ pressed }) => [s.btn, small && s.btnSmall, { backgroundColor: color, opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={[s.btnText, small && { fontSize: 12 }]}>{label}</Text>
    </Pressable>
  );
}

export function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export const s = StyleSheet.create({
  bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: C.line },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  pillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  btn: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  btnSmall: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  btnText: { color: '#000', fontWeight: '800', fontSize: 14 },
  section: { backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.line },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { color: C.text, fontSize: 16, fontWeight: '800' },
  dim: { color: C.dim, fontSize: 12 },
  text: { color: C.text, fontSize: 14 },
  bold: { color: C.text, fontSize: 14, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center' },
});
