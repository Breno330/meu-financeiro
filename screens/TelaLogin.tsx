import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  SafeAreaView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { supabase } from '../supabase';
import { C } from '../constants';

export function TelaLogin() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [modo, setModo] = useState<'login' | 'cadastro'>('login');
  const [carregando, setCarregando] = useState(false);

  async function entrar() {
    if (!email.trim() || !senha) { Alert.alert('Preencha todos os campos'); return; }
    setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) Alert.alert('Erro ao entrar', error.message);
    setCarregando(false);
  }

  async function cadastrar() {
    if (!email.trim() || !senha) { Alert.alert('Preencha todos os campos'); return; }
    if (senha.length < 6) { Alert.alert('Senha fraca', 'A senha deve ter pelo menos 6 caracteres.'); return; }
    setCarregando(true);
    const { error } = await supabase.auth.signUp({ email: email.trim(), password: senha });
    if (error) Alert.alert('Erro ao cadastrar', error.message);
    else Alert.alert('Conta criada!', 'Verifique seu e-mail para confirmar o cadastro.');
    setCarregando(false);
  }

  const inputStyle = {
    borderWidth: 1.5, borderColor: C.border, borderRadius: 10,
    padding: 13, fontSize: 14 as const, marginBottom: 16,
    color: C.text, backgroundColor: C.bg,
  };

  const LP = {
    bg: C.bg, accent: C.primary, accentLight: C.bgAccent,
    accentMid: C.border, text: C.text, label: C.label, highlight: C.receita,
  };

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: LP.bg }}>
        <View style={{ flex: 1, flexDirection: 'row' }}>

          {/* ── Painel esquerdo — branding ── */}
          <View style={{ flex: 1.1, backgroundColor: LP.bg, paddingHorizontal: 56, paddingVertical: 48, justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: LP.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18 }}>💰</Text>
              </View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: LP.text }}>Meu Financeiro</Text>
            </View>

            <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 32 }}>
              <View style={{ alignSelf: 'flex-start', backgroundColor: C.receitaBg, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, marginBottom: 22 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: C.receita }}>Organize. Planeje. Conquiste.</Text>
              </View>
              <Text style={{ fontSize: 42, fontWeight: '800', color: LP.text, lineHeight: 52, letterSpacing: -1, marginBottom: 16 }}>
                {'Sua vida financeira\nem '}
                <Text style={{ color: LP.highlight }}>um só lugar</Text>
              </Text>
              <Text style={{ fontSize: 15, color: LP.label, lineHeight: 26, marginBottom: 40, maxWidth: 380 }}>
                Acompanhe receitas, despesas, metas e tenha clareza total sobre seu dinheiro.
              </Text>
              {[
                { icon: '📈', title: 'Visão completa', desc: 'Tenha controle de todas as suas finanças' },
                { icon: '🎯', title: 'Metas inteligentes', desc: 'Defina objetivos e acompanhe seu progresso' },
                { icon: '🔒', title: 'Seguro e privado', desc: 'Seus dados protegidos com segurança' },
              ].map((f, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: LP.accentLight, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 19 }}>{f.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: LP.text, marginBottom: 2 }}>{f.title}</Text>
                    <Text style={{ fontSize: 12, color: LP.label }}>{f.desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Mini mockup */}
            <View style={{ alignItems: 'flex-start' }}>
              <View style={{ width: 220, backgroundColor: '#fff', borderRadius: 18, padding: 16, shadowColor: LP.accent, shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 10, borderWidth: 1, borderColor: LP.accentMid }}>
                <Text style={{ fontSize: 10, color: LP.label, marginBottom: 3 }}>Saldo atual</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: LP.text }}>R$ 2.560,75</Text>
                  <View style={{ backgroundColor: '#ECFDF5', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 }}>
                    <Text style={{ fontSize: 9, color: '#10B981', fontWeight: '700' }}>+12,5%</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 10, color: LP.label, marginBottom: 10 }}>Resumo do mês</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
                  <View>
                    <Text style={{ fontSize: 9, color: '#10B981', fontWeight: '600', marginBottom: 2 }}>Receitas</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: LP.text }}>R$ 4.350,00</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 9, color: '#F43F5E', fontWeight: '600', marginBottom: 2 }}>Despesas</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: LP.text }}>R$ 1.789,25</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 4, alignItems: 'flex-end', height: 32 }}>
                  {[40,65,45,80,55,90,50].map((h, i) => (
                    <View key={i} style={{ flex: 1, justifyContent: 'flex-end' }}>
                      <View style={{ height: Math.round(h * 0.32), backgroundColor: i === 5 ? LP.accent : LP.accentLight, borderRadius: 3 }}/>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>

          {/* ── Painel direito — formulário ── */}
          <View style={{ flex: 1, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', padding: 64, borderLeftWidth: 1, borderLeftColor: LP.accentMid }}>
            <View style={{ width: '100%', maxWidth: 380 }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: LP.text, letterSpacing: -0.5, marginBottom: 6 }}>
                {modo === 'login' ? 'Bem-vindo de volta' : 'Criar conta'}
              </Text>
              <Text style={{ fontSize: 14, color: LP.label, marginBottom: 36 }}>
                {modo === 'login' ? 'Entre na sua conta para continuar' : 'Crie sua conta gratuitamente'}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: LP.text, marginBottom: 7 }}>E-mail</Text>
              <TextInput
                style={[inputStyle, { borderColor: LP.accentMid }]}
                placeholder="seu@email.com" placeholderTextColor={C.textLight}
                value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
              />
              <Text style={{ fontSize: 13, fontWeight: '600', color: LP.text, marginBottom: 7 }}>Senha</Text>
              <TextInput
                style={[inputStyle, { borderColor: LP.accentMid, marginBottom: 28 }]}
                placeholder="••••••••" placeholderTextColor={C.textLight}
                value={senha} onChangeText={setSenha} secureTextEntry
              />
              <TouchableOpacity
                style={{ backgroundColor: LP.accent, borderRadius: 10, padding: 15, alignItems: 'center', opacity: carregando ? 0.6 : 1, marginBottom: 20 }}
                onPress={modo === 'login' ? entrar : cadastrar} disabled={carregando}
              >
                {carregando
                  ? <ActivityIndicator color="#fff"/>
                  : <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>{modo === 'login' ? 'Entrar' : 'Criar conta'}</Text>
                }
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
                <Text style={{ fontSize: 14, color: LP.label }}>{modo === 'login' ? 'Não tem conta?' : 'Já tem conta?'}</Text>
                <TouchableOpacity onPress={() => setModo(modo === 'login' ? 'cadastro' : 'login')}>
                  <Text style={{ fontSize: 14, color: LP.accent, fontWeight: '700' }}>{modo === 'login' ? 'Cadastre-se' : 'Entrar'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

        </View>
      </SafeAreaView>
    );
  }

  // Layout mobile
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.primaryDark }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ paddingTop: 52, paddingBottom: 44, paddingHorizontal: 28, alignItems: 'center' }}>
          <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 30 }}>💰</Text>
          </View>
          <Text style={{ fontSize: 24, fontWeight: '700', color: '#fff', letterSpacing: -0.5, marginBottom: 6 }}>Meu Financeiro</Text>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center' }}>Controle suas finanças com facilidade</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28 }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: C.text, letterSpacing: -0.4, marginBottom: 4 }}>
            {modo === 'login' ? 'Entrar na conta' : 'Criar conta'}
          </Text>
          <Text style={{ fontSize: 13, color: C.label, marginBottom: 24 }}>
            {modo === 'login' ? 'Bem-vindo de volta 👋' : 'Preencha os dados abaixo'}
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 7 }}>E-mail</Text>
          <TextInput
            style={inputStyle} placeholder="seu@email.com" placeholderTextColor={C.textLight}
            value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
          />
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 7 }}>Senha</Text>
          <TextInput
            style={[inputStyle, { marginBottom: 28 }]} placeholder="••••••••" placeholderTextColor={C.textLight}
            value={senha} onChangeText={setSenha} secureTextEntry
          />
          <TouchableOpacity
            style={{ backgroundColor: C.primary, borderRadius: 12, padding: 15, alignItems: 'center', opacity: carregando ? 0.6 : 1 }}
            onPress={modo === 'login' ? entrar : cadastrar} disabled={carregando}
          >
            {carregando
              ? <ActivityIndicator color="#fff"/>
              : <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>{modo === 'login' ? 'Entrar' : 'Criar conta'}</Text>
            }
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 20 }}>
            <Text style={{ fontSize: 14, color: C.label }}>{modo === 'login' ? 'Não tem conta?' : 'Já tem conta?'}</Text>
            <TouchableOpacity onPress={() => setModo(modo === 'login' ? 'cadastro' : 'login')}>
              <Text style={{ fontSize: 14, color: C.primary, fontWeight: '700' }}>{modo === 'login' ? 'Cadastre-se' : 'Entrar'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
