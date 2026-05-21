import { View } from 'react-native';
import { T as Text } from './T';
import Svg, { Path, Circle } from 'react-native-svg';
import { CORES_CAT } from '../constants';
import { useTheme } from '../contexts/ThemeContext';

type Props = {
  /** Pares [rótulo, valor] */
  dados: [string, number][];
  /** Cores em ordem — se omitido usa CORES_CAT pelo rótulo */
  colors?: string[];
  /** Diâmetro do SVG (default 160) */
  size?: number;
  /** Texto principal no centro do donut */
  centerLabel?: string;
  /** Subtexto no centro do donut */
  centerSub?: string;
};

export function GraficoPizza({
  dados,
  colors,
  size = 160,
  centerLabel,
  centerSub,
}: Props) {
  const { C } = useTheme();

  const total = dados.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return null;

  const R      = size * 0.40;   // raio externo
  const innerR = size * 0.23;   // raio interno do donut (~57% de R)
  const cx     = size / 2;
  const cy     = size / 2;
  const GAP    = 2;             // stroke entre fatias (px)

  // ── Caso especial: fatia única ────────────────────────────────────────────
  if (dados.length === 1) {
    const color = colors?.[0] ?? CORES_CAT[dados[0][0]] ?? C.label;
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size}>
          <Circle cx={cx} cy={cy} r={R}      fill={color} />
          <Circle cx={cx} cy={cy} r={innerR} fill={C.bgCard} />
        </Svg>
        {(centerLabel || centerSub) && (
          <View style={{
            position: 'absolute', alignItems: 'center', justifyContent: 'center',
            width: size, height: size,
          }}>
            {centerLabel && (
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, textAlign: 'center' }}>
                {centerLabel}
              </Text>
            )}
            {centerSub && (
              <Text style={{ fontSize: 10, color: C.textLight, textAlign: 'center', marginTop: 2 }}>
                {centerSub}
              </Text>
            )}
          </View>
        )}
      </View>
    );
  }

  // ── Múltiplas fatias ──────────────────────────────────────────────────────
  let ang = -Math.PI / 2;
  const fatias = dados.map(([cat, val], i) => {
    const sweep = (val / total) * 2 * Math.PI;
    const color = colors?.[i] ?? CORES_CAT[cat] ?? C.label;

    const x1 = cx + R * Math.cos(ang);
    const y1 = cy + R * Math.sin(ang);
    ang += sweep;
    const x2 = cx + R * Math.cos(ang);
    const y2 = cy + R * Math.sin(ang);
    const large = sweep > Math.PI ? 1 : 0;

    // Arc de tarte: M centro L ponto1 A raio...  ponto2 Z
    const d = `M${cx} ${cy} L${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2}Z`;

    return { cat, val, color, d };
  });

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        {/* Fatias — stroke cria separação visual entre elas */}
        {fatias.map(f => (
          <Path
            key={f.cat}
            d={f.d}
            fill={f.color}
            stroke={C.bgCard}
            strokeWidth={GAP}
            strokeLinejoin="round"
          />
        ))}
        {/* Buraco central — transforma pizza em donut */}
        <Circle cx={cx} cy={cy} r={innerR} fill={C.bgCard} />
      </Svg>

      {/* Texto central — posicionado absolutamente sobre o SVG */}
      {(centerLabel || centerSub) && (
        <View style={{
          position: 'absolute', alignItems: 'center', justifyContent: 'center',
          width: size, height: size,
          pointerEvents: 'none' as any,
        }}>
          {centerLabel && (
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, textAlign: 'center' }}>
              {centerLabel}
            </Text>
          )}
          {centerSub && (
            <Text style={{ fontSize: 10, color: C.textLight, textAlign: 'center', marginTop: 2 }}>
              {centerSub}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
