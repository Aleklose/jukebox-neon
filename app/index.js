import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { ImageBackground, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// --- PALETA NEÓN ---
const THEME = {
  bg: '#050505',
  glass: 'rgba(255, 255, 255, 0.1)',
  glassBorder: 'rgba(255, 255, 255, 0.2)',
  text: '#FFFFFF',
  textDim: '#AAAAAA',
  cyan: '#00F0FF',
  pink: '#FF00AA',
  gradientPrimary: ['#00F0FF', '#FF00AA'], // Cian a Rosa
  gradientGreen: ['#00FF94', '#00B8FF'], // Verde a Azul
  gradientRed: ['#FF2E2E', '#A80000'], // Rojo Intenso
  gradientGold: ['#FFD700', '#FF8C00'], // Dorado
};

const WINNING_OPTIONS = [10, 25, 50, 100];
const BACKGROUND_IMAGE = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=2070&auto=format&fit=crop';

export default function App() {
  const [gameState, setGameState] = useState('SETUP'); 
  const [players, setPlayers] = useState([]);
  const [name, setName] = useState('');
  const [winningScore, setWinningScore] = useState(50); // Meta configurable
  const [djIndex, setDjIndex] = useState(0);
  const [timer, setTimer] = useState(45);
  const [activeTimer, setActiveTimer] = useState(false);
  
  // Nuevo estado para la canción manual
  const [currentSong, setCurrentSong] = useState({ artist: '', title: '' });

  // --- LÓGICA DEL TIMER ---
  useEffect(() => {
    let interval = null;
    if (activeTimer && timer > 0) {
      interval = setInterval(() => setTimer(t => t - 1), 1000);
    } else if (timer === 0) {
      setActiveTimer(false);
      setGameState('SCORING'); 
    }
    return () => clearInterval(interval);
  }, [activeTimer, timer]);

  // --- FUNCIONES LÓGICAS ---
  const addPlayer = () => {
    if (name.trim()) {
      setPlayers([...players, { name, score: 0, id: Date.now() }]);
      setName('');
    }
  };

  const startGame = () => {
    if (players.length < 2) return alert("¡Mínimo 2 jugadores!");
    setDjIndex(Math.floor(Math.random() * players.length));
    setGameState('DJ');
  };

  const startRound = () => {
    if (!currentSong.artist.trim() || !currentSong.title.trim()) {
      return alert("¡DJ! Escribe qué canción vas a poner.");
    }
    setTimer(45);
    setActiveTimer(true);
    setGameState('GUESSING');
  };

  const handleScore = (type, playerIndex = null) => {
    const newPlayers = [...players];
    
    if (type === 'GUESSED' && playerIndex !== null) {
      newPlayers[playerIndex].score += 1;
    } else if (type === 'GOOD_SONG') {
      newPlayers[djIndex].score += 2;
    } else if (type === 'BAD_SONG') {
      newPlayers[djIndex].score -= 2;
    }
    
    finishTurn(newPlayers);
  };

  const finishTurn = (updatedPlayers) => {
    setPlayers(updatedPlayers);
    const winner = updatedPlayers.find(p => p.score >= winningScore);
    
    // Limpiar info de canción
    setCurrentSong({ artist: '', title: '' });

    if (winner) {
      setGameState('WINNER');
    } else {
      setDjIndex((prev) => (prev + 1) % updatedPlayers.length);
      setGameState('DJ');
    }
  };

  const resetGame = () => {
    setPlayers([]);
    setCurrentSong({ artist: '', title: '' });
    setGameState('SETUP');
  };

  // --- COMPONENTES UI ---
  const NeonButton = ({ title, onPress, colors = THEME.gradientPrimary, style, disabled }) => (
    <TouchableOpacity onPress={onPress} style={[styles.btnContainer, style, disabled && {opacity: 0.5}]} disabled={disabled}>
      <LinearGradient colors={colors} start={{x:0, y:0}} end={{x:1, y:0}} style={styles.btnGradient}>
        <Text style={styles.btnText}>{title}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );

  const GlassCard = ({ children, style }) => (
    <BlurView intensity={Platform.OS === 'web' ? 0 : 30} style={[styles.glassCard, style]}>
      <View style={{backgroundColor: Platform.OS === 'web' ? 'rgba(20,20,20,0.85)' : 'rgba(0,0,0,0.3)', flex:1, padding: 20}}>
         {children}
      </View>
    </BlurView>
  );

  // --- PANTALLAS ---
  
  // 1. SETUP (LOBBY) - Ahora con selector de puntos
  if (gameState === 'SETUP') return (
    <MainLayout>
      <Text style={styles.neonTitle}>JUKEBOX</Text>
      
      <GlassCard style={{marginTop: 20}}>
        {/* Input Nombre */}
        <TextInput 
          style={styles.input} 
          placeholder="Nombre del jugador..." 
          placeholderTextColor="#666"
          value={name}
          onChangeText={setName}
          onSubmitEditing={addPlayer}
        />
        <NeonButton title="AGREGAR" onPress={addPlayer} style={{marginBottom: 10}} />
        
        {/* Lista Jugadores */}
        <ScrollView style={styles.list}>
          {players.map((p) => (
            <View key={p.id} style={styles.playerPill}>
              <Text style={styles.playerText}>{p.name}</Text>
            </View>
          ))}
        </ScrollView>
      </GlassCard>

      {/* Selector de Puntos */}
      <View style={{marginTop: 20, width: '100%'}}>
        <Text style={styles.sectionHeader}>META DE PUNTOS:</Text>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', gap: 10}}>
          {WINNING_OPTIONS.map(score => (
             <TouchableOpacity 
                key={score} 
                onPress={() => setWinningScore(score)}
                style={[styles.scoreOption, winningScore === score && styles.scoreOptionSelected]}
             >
                <Text style={[styles.scoreOptionText, winningScore === score && {color: 'black', fontWeight: 'bold'}]}>{score}</Text>
             </TouchableOpacity>
          ))}
        </View>
      </View>

      {players.length > 1 && (
        <NeonButton title="START PARTY" onPress={startGame} style={styles.bigButton} />
      )}
    </MainLayout>
  );

  // 2. DJ SPOTLIGHT - Ahora con Inputs de Canción
  if (gameState === 'DJ') return (
    <MainLayout>
      <Text style={styles.roleTitle}>TURNO DE DJ</Text>
      <Text style={styles.bigNeonName}>{players[djIndex].name}</Text>
      <Text style={styles.scoreBadge}>{players[djIndex].score} pts</Text> 
      
      <GlassCard style={{marginTop: 20}}>
        <Text style={[styles.instruction, {marginBottom: 10}]}>1. Busca tu canción en Spotify/YT</Text>
        <Text style={[styles.instruction, {marginBottom: 15}]}>2. Escribe los datos (Secreto 🤫)</Text>
        
        <TextInput 
          style={styles.input} 
          placeholder="Nombre de la Canción" 
          placeholderTextColor="#555"
          value={currentSong.title}
          onChangeText={(t) => setCurrentSong({...currentSong, title: t})}
        />
        <TextInput 
          style={styles.input} 
          placeholder="Artista" 
          placeholderTextColor="#555"
          value={currentSong.artist}
          onChangeText={(t) => setCurrentSong({...currentSong, artist: t})}
        />

        <NeonButton title="¡LISTO, DALE PLAY!" onPress={startRound} style={{marginTop: 10}} />
      </GlassCard>
    </MainLayout>
  );

  // 3. GUESSING (TIMER) - Igual
  if (gameState === 'GUESSING') return (
    <MainLayout>
      <View style={styles.timerContainer}>
         <LinearGradient colors={timer < 10 ? THEME.gradientRed : THEME.gradientPrimary} style={styles.timerCircle}>
            <View style={styles.timerInner}>
               <Text style={styles.timerText}>{timer}</Text>
            </View>
         </LinearGradient>
      </View>
      
      <View style={{flexDirection: 'row', alignItems: 'center', height: 50, marginBottom: 50, gap: 5}}>
          {[...Array(10)].map((_,i) => (
              <View key={i} style={{width: 5, height: Math.random()*40 + 10, backgroundColor: THEME.cyan, borderRadius: 5}} />
          ))}
      </View>

      <NeonButton 
        title="¡STOP / ALGUIEN SABE!" 
        colors={THEME.gradientRed}
        onPress={() => {setActiveTimer(false); setGameState('SCORING')}} 
      />
    </MainLayout>
  );

  // 4. SCORING (DECISION) - Ahora muestra la canción y los puntos
  if (gameState === 'SCORING') return (
    <MainLayout>
      <Text style={styles.neonTitle}>RESULTADOS</Text>
      
      {/* LA REVELACIÓN DE LA CANCIÓN */}
      <GlassCard style={{marginVertical: 15, padding: 15}}>
         <Text style={styles.sectionHeader}>LA CANCIÓN ERA:</Text>
         <Text style={styles.songTitle}>{currentSong.title}</Text>
         <Text style={styles.songArtist}>{currentSong.artist}</Text>
      </GlassCard>

      <ScrollView style={{width: '100%', flex: 1}}>
        <Text style={styles.sectionHeader}>¿ALGUIEN ADIVINÓ?</Text>
        {players.map((p, i) => (
          i !== djIndex && (
            <TouchableOpacity key={p.id} onPress={() => handleScore('GUESSED', i)}>
              <LinearGradient colors={[THEME.bg, '#222']} style={styles.scorePill}>
                 <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                    <Text style={styles.playerText}>🙋‍♂️ {p.name}</Text>
                    <Text style={styles.pillScore}>{p.score} pts</Text>
                 </View>
              </LinearGradient>
            </TouchableOpacity>
          )
        ))}

        <Text style={[styles.sectionHeader, {marginTop: 20}]}>SI NADIE ADIVINÓ...</Text>
        
        <NeonButton 
            title="BUENA ROLA (+2 DJ)" 
            colors={THEME.gradientGreen}
            onPress={() => handleScore('GOOD_SONG')}
            style={{marginBottom: 10}}
        />
        
        <NeonButton 
            title="MALA ROLA (-2 DJ)" 
            colors={THEME.gradientRed}
            onPress={() => handleScore('BAD_SONG')}
        />
      </ScrollView>
    </MainLayout>
  );

  // 5. WINNER - Igual pero más brillante
  if (gameState === 'WINNER') {
    const winner = players.sort((a,b) => b.score - a.score)[0];
    return (
      <MainLayout>
        <Text style={styles.neonTitle}>¡CAMPEÓN!</Text>
        <Text style={styles.bigNeonName}>{winner.name}</Text>
        <Text style={styles.neonSubtitle}>{winner.score} PUNTOS</Text>

        <ScrollView style={{width: '100%', maxHeight: 200, marginVertical: 30}}>
             {players.map(p => (
                 <View key={p.id} style={styles.row}>
                     <Text style={{color: 'white', fontSize: 18}}>{p.name}</Text>
                     <Text style={{color: THEME.cyan, fontSize: 18, fontWeight: 'bold'}}>{p.score}</Text>
                 </View>
             ))}
        </ScrollView>

        <NeonButton title="JUGAR DE NUEVO" colors={THEME.gradientGold} onPress={resetGame} />
      </MainLayout>
    );
  }
  return null;
}

// Layout Wrapper
const MainLayout = ({children}) => (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ImageBackground source={{uri: BACKGROUND_IMAGE}} style={styles.bgImage} resizeMode="cover">
          <BlurView intensity={90} tint="dark" style={styles.blurContainer}>
              {children}
          </BlurView>
      </ImageBackground>
    </KeyboardAvoidingView>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  bgImage: { flex: 1, width: '100%', height: '100%' },
  blurContainer: { flex: 1, padding: 20, paddingTop: 50, alignItems: 'center' },
  
  // Textos
  neonTitle: { fontSize: 36, fontWeight: 'bold', color: 'white', textShadowColor: THEME.cyan, textShadowRadius: 15, textAlign: 'center' },
  neonSubtitle: { fontSize: 18, color: THEME.cyan, letterSpacing: 2, marginBottom: 20, textAlign: 'center' },
  roleTitle: { fontSize: 16, color: THEME.pink, letterSpacing: 4, fontWeight: 'bold', textTransform: 'uppercase' },
  bigNeonName: { fontSize: 40, fontWeight: 'bold', color: 'white', textShadowColor: THEME.pink, textShadowRadius: 20, marginVertical: 5, textAlign: 'center' },
  scoreBadge: { fontSize: 20, color: THEME.cyan, fontWeight: 'bold', marginBottom: 10 },
  instruction: { color: '#ccc', fontSize: 14, textAlign: 'center' },
  sectionHeader: { color: '#888', marginBottom: 10, textTransform: 'uppercase', fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
  songTitle: { color: 'white', fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 5 },
  songArtist: { color: THEME.cyan, fontSize: 18, textAlign: 'center' },

  // Inputs & Cards
  glassCard: { width: '100%', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: THEME.glassBorder },
  input: { backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', padding: 15, borderRadius: 10, fontSize: 16, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  list: { maxHeight: 150, width: '100%' },
  playerPill: { backgroundColor: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 8, marginBottom: 5 },
  playerText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  pillScore: { color: THEME.cyan, fontSize: 16, fontWeight: 'bold' },
  
  // Selector de Puntos
  scoreOption: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  scoreOptionSelected: { backgroundColor: THEME.cyan, borderColor: THEME.cyan },
  scoreOptionText: { color: '#666', fontWeight: 'bold' },

  // Botones
  btnContainer: { width: '100%', borderRadius: 12, overflow: 'hidden', height: 50, marginVertical: 5 },
  btnGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  btnText: { color: 'black', fontWeight: '900', fontSize: 16, letterSpacing: 1 },
  bigButton: { marginTop: 30, height: 60 },
  
  // Timer & Otros
  timerContainer: { alignItems: 'center', justifyContent: 'center', marginBottom: 40, marginTop: 40 },
  timerCircle: { width: 200, height: 200, borderRadius: 100, padding: 3, justifyContent: 'center', alignItems: 'center' },
  timerInner: { width: 180, height: 180, borderRadius: 90, backgroundColor: '#050505', justifyContent: 'center', alignItems: 'center' },
  timerText: { color: 'white', fontSize: 70, fontWeight: 'bold' },
  scorePill: { padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#333', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderColor: '#333' }
});