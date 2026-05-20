import { View } from 'react-native';
import { T as Text } from './T';
import Svg, { Path } from 'react-native-svg';
import { CORES_CAT } from '../constants';
import { C } from '../constants';

type Props = { dados: [string, number][] };

export function GraficoPizza({ dados }: Props) {
  const total = dados.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return null;

  const SIZE = 200, R = 80, cx = 100, cy = 100;
  let ang = -Math.PI / 2;
  const fatias = dados.map(([cat, val]) => {
    const sweep = (val / total) * 2 * Math.PI;
    const x1 = cx + R * Math.cos(ang), y1 = cy + R * Math.sin(ang);
    ang += sweep;
    const x2 = cx + R * Math.cos(ang), y2 = cy + R * Math.sin(ang);
    const large = sweep > Math.PI ? 1 : 0;
    return {
      cat, val,
      color: CORES_CAT[cat] || '#888',
      d: `M${cx} ${cy} L${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2}Z`,
    };
  });

  return (
    <View style={{ alignItems: 'center', marginBottom: 8 }}>
      <Svg width={SIZE} height={SIZE}>
        {fatias.map(f => <Path key={f.cat} d={f.d} fill={f.color} />)}
      </Svg>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 8 }}>
        {fatias.map(f => (
          <View key={f.cat} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: f.color }} />
            <Text style={{ fontSize: 12, color: C.label }}>
              {f.cat} {Math.round(f.val / total * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
