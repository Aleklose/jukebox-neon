import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Alert, ImageBackground, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// --- IMPORTAR FIREBASE ---
import { get, onValue, push, ref, remove, set, update } from 'firebase/database';
import { database } from './firebase';

// --- PALETA NEÓN ---
const THEME = {
  bg: '#050505',
  glass: 'rgba(255, 255, 255, 0.1)',
  glassBorder: 'rgba(255, 255, 255, 0.2)',
  text: '#FFFFFF',
  cyan: '#00F0FF',
  pink: '#FF00AA',
  gradientPrimary: ['#00F0FF', '#FF00AA'], 
  gradientGreen: ['#00FF94', '#00B8FF'], 
  gradientRed: ['#FF2E2E', '#A80000'], 
  gradientGold: ['#FFD700', '#FF8C00'],
  gradientGray: ['#333', '#111'], // Para estado inactivo
};

const WINNING_OPTIONS = [10, 25, 50, 100];
const BACKGROUND_IMAGE = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=2070&auto=format&fit=crop';
const ROOM_ID = 'fiesta-navidad'; 

export default function App() {
  // --- IDENTIDAD LOCAL ---
  const [myId, setMyId] = useState(null); // <--- AQUÍ GUARDAMOS QUIÉN ERES TÚ
  const [myName, setMyName] = useState('');
  const [songInput, setSongInput] = useState({ artist: '', title: '' });
  
  // Estados de Firebase
  const [gameState, setGameState] = useState('SETUP');
  const [players, setPlayers] = useState([]);
  const [winningScore, setWinningScore] = useState(50);
  const [djIndex, setDjIndex] = useState(0);
  const [timer, setTimer] = useState(45);
  const [currentSong, setCurrentSong] = useState({ artist: '', title: '' });
  const [activeTimer, setActiveTimer] = useState(false);

  // --- CONEXIÓN ---
  useEffect(() => {
    const roomRef = ref(database, ROOM_ID);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setGameState(data.gameState || 'SETUP');
        setWinningScore(data.winningScore || 50);
        setDjIndex(data.djIndex || 0);
        setTimer(data.timer || 45);
        setCurrentSong(data.currentSong || { artist: '', title: '' });
        setActiveTimer(data.activeTimer || false);
        
        if (data.players) {
          const playersArray = Object.keys(data.players).map(key => ({
            id: key,
            ...data.players[key]
          }));
          setPlayers(playersArray);
        } else {
          setPlayers([]);
        }
      } else {
        set(roomRef, { gameState: 'SETUP', winningScore: 50, timer: 45, djIndex: 0 });
      }
    });
    return () => unsubscribe();
  }, []);

  // --- TIMER (Solo el DJ actual lo controla para evitar conflictos) ---
  useEffect(() => {
    let interval = null;
    // Solo si soy el DJ y el timer está activo, yo envío la cuenta regresiva a la nube
    const iAmDj = players[djIndex]?.id === myId;
    
    if (activeTimer && timer > 0 && iAmDj) {
      interval = setInterval(() => {
         update(ref(database, ROOM_ID), { timer: timer - 1 });
      }, 1000);
    } else if (timer === 0 && activeTimer && iAmDj) {
      update(ref(database, ROOM_ID), { activeTimer: false, gameState: 'SCORING' });
    }
    return () => clearInterval(interval);
  }, [activeTimer, timer, myId, players, djIndex]);


  // --- ACCIONES ---
  const addPlayer = async () => {
    if (myName.trim()) {
      // 1. Nos guardamos en Firebase
      const newPlayerRef = push(ref(database, `${ROOM_ID}/players`), { 
        name: myName, 
        score: 0 
      });
      // 2. ¡IMPORTANTE! Guardamos nuestra "Cédula de Identidad" localmente
      setMyId(newPlayerRef.key); 
      setMyName('');
    }
  };

  const updateWinningScore = (score) => {
    update(ref(database, ROOM_ID), { winningScore: score });
  };

  const startGame = () => {
    if (players.length < 2) return alert("¡Mínimo 2 jugadores!");
    const randomDj = Math.floor(Math.random() * players.length);
    update(ref(database, ROOM_ID), { 
        gameState: 'DJ', 
        djIndex: randomDj 
    });
  };

  const startRound = () => {
    if (!songInput.artist.trim() || !songInput.title.trim()) {
      return alert("¡Escribe la canción primero!");
    }
    update(ref(database, ROOM_ID), { 
        currentSong: songInput,
        timer: 45,
        activeTimer: true,
        gameState: 'GUESSING'
    });
    setSongInput({ artist: '', title: '' });
  };

  const stopTimer = () => {
    update(ref(database, ROOM_ID), { activeTimer: false, gameState: 'SCORING' });
  };

  const handleScore = (type, playerKey = null) => {
    const updates = {};
    const currentPlayer = players[djIndex];
    
    if (type === 'GUESSED' && playerKey) {
       const winner = players.find(p => p.id === playerKey);
       updates[`players/${playerKey}/score`] = winner.score + 1;
    } else if (type === 'GOOD_SONG') {
       updates[`players/${currentPlayer.id}/score`] = currentPlayer.score + 2;
    } else if (type === 'BAD_SONG') {
       updates[`players/${currentPlayer.id}/score`] = currentPlayer.score - 2;
    }

    update(ref(database, `${ROOM_ID}`), updates).then(() => {
        checkWinnerOrNextTurn();
    });
  };

  const checkWinnerOrNextTurn = async () => {
    const snapshot = await get(ref(database, `${ROOM_ID}/players`));
    const playersObj = snapshot.val();
    const playersArr = Object.values(playersObj);

    const winner = playersArr.find(p => p.score >= winningScore);

    if (winner) {
        update(ref(database, ROOM_ID), { gameState: 'WINNER' });
    } else {
        const nextDj = (djIndex + 1) % players.length;
        update(ref(database, ROOM_ID), { 
            gameState: 'DJ', 
            djIndex: nextDj,
            currentSong: {artist: '', title: ''}
        });
    }
  };

  const resetGame = () => {
    remove(ref(database, ROOM_ID)); 
    setMyId(null); // Resetear identidad local
  };

  const forceEndGame = () => {
    Alert.alert("Terminar Juego", "¿Forzar final?", [
        { text: "Cancelar" },
        { text: "Sí", onPress: () => update(ref(database, ROOM_ID), { gameState: 'WINNER' }) }
    ]);
  };

  // --- UI COMPONENTS ---
  const NeonButton = ({ title, onPress, colors = THEME.gradientPrimary, style, disabled }) => (
    <TouchableOpacity onPress={onPress} style={[styles.btnContainer, style, disabled && {opacity: 0.5}]} disabled={disabled}>
      <LinearGradient colors={disabled ? THEME.gradientGray : colors} start={{x:0, y:0}} end={{x:1, y:0}} style={styles.btnGradient}>
        <Text style={[styles.btnText, disabled && {color: '#666'}]}>{title}</Text>
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
  
  // 1. LOBBY
  if (gameState === 'SETUP') {
    // Si ya me registré, muestro pantalla de espera
    if (myId) {
      return (
        <MainLayout>
          <Text style={styles.neonTitle}>LOBBY</Text>
          <Text style={styles.instruction}>Esperando jugadores...</Text>
          <GlassCard style={{marginTop: 20}}>
             <ScrollView style={styles.list}>
              {players.map((p) => (
                <View key={p.id} style={styles.playerPill}>
                  <Text style={styles.playerText}>{p.id === myId ? `⭐ ${p.name} (Tú)` : p.name}</Text>
                </View>
              ))}
            </ScrollView>
          </GlassCard>
          {/* Solo el anfitrión (el primero en la lista o cualquiera ya registrado) puede iniciar */}
          <NeonButton title="INICIAR FIESTA" onPress={startGame} style={styles.bigButton} />
        </MainLayout>
      );
    }

    return (
    <MainLayout>
      <Text style={styles.neonTitle}>JUKEBOX</Text>
      <GlassCard style={{marginTop: 20}}>
        <TextInput 
          style={styles.input} 
          placeholder="Tu Nombre..." 
          placeholderTextColor="#666"
          value={myName}
          onChangeText={setMyName}
        />
        <NeonButton title="ENTRAR" onPress={addPlayer} />
      </GlassCard>
      
      {/* Selector de Puntos Visible para todos en setup */}
      <View style={{marginTop: 20, width: '100%'}}>
        <Text style={styles.sectionHeader}>META DE PUNTOS: {winningScore}</Text>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', gap: 10}}>
          {WINNING_OPTIONS.map(score => (
             <TouchableOpacity 
                key={score} 
                onPress={() => updateWinningScore(score)}
                style={[styles.scoreOption, winningScore === score && styles.scoreOptionSelected]}
             >
                <Text style={[styles.scoreOptionText, winningScore === score && {color: 'black', fontWeight: 'bold'}]}>{score}</Text>
             </TouchableOpacity>
          ))}
        </View>
      </View>
    </MainLayout>
  );
  }

  // 2. DJ SPOTLIGHT (CON RESTRICCIÓN)
  if (gameState === 'DJ') {
    const currentDj = players[djIndex];
    const isMyTurn = currentDj?.id === myId; // ¿SOY YO EL DJ?

    return (
    <MainLayout showExit>
      <Text style={styles.roleTitle}>TURNO DE DJ</Text>
      <Text style={styles.bigNeonName}>{currentDj?.name}</Text>
      
      {isMyTurn ? (
        // --- VISTA PARA EL DJ (CONTROLES) ---
        <GlassCard style={{marginTop: 20, borderColor: THEME.cyan}}>
          <Text style={[styles.instruction, {marginBottom: 10, color: THEME.cyan}]}>TE TOCA: Elige canción secreta</Text>
          <TextInput 
            style={styles.input} 
            placeholder="Canción" 
            placeholderTextColor="#555"
            value={songInput.title}
            onChangeText={(t) => setSongInput({...songInput, title: t})}
          />
          <TextInput 
            style={styles.input} 
            placeholder="Artista" 
            placeholderTextColor="#555"
            value={songInput.artist}
            onChangeText={(t) => setSongInput({...songInput, artist: t})}
          />
          <NeonButton title="¡DALE PLAY!" onPress={startRound} style={{marginTop: 10}} />
        </GlassCard>
      ) : (
        // --- VISTA PARA LOS DEMÁS (ESPERA) ---
        <GlassCard style={{marginTop: 20}}>
           <Text style={{color: '#666', textAlign: 'center', fontSize: 18}}>
             🤫 El DJ está eligiendo...
           </Text>
           <View style={{marginTop: 20, alignItems: 'center'}}>
              <Text style={{fontSize: 40}}>💿</Text>
           </View>
        </GlassCard>
      )}

      <TouchableOpacity onPress={forceEndGame} style={styles.endGameBtn}><Text style={{color:'red'}}>X</Text></TouchableOpacity>
    </MainLayout>
  );
  }

  // 3. GUESSING (CON RESTRICCIÓN)
  if (gameState === 'GUESSING') {
    const currentDj = players[djIndex];
    const isMyTurn = currentDj?.id === myId; // Solo el DJ puede parar el timer

    return (
    <MainLayout showExit>
      <View style={styles.timerContainer}>
         <LinearGradient colors={timer < 10 ? THEME.gradientRed : THEME.gradientPrimary} style={styles.timerCircle}>
            <View style={styles.timerInner}>
               <Text style={styles.timerText}>{timer}</Text>
            </View>
         </LinearGradient>
      </View>
      
      {isMyTurn ? (
         <NeonButton 
            title="¡STOP / ALGUIEN SABE!" 
            colors={THEME.gradientRed}
            onPress={stopTimer} 
         />
      ) : (
         <Text style={styles.instruction}>¡Adivina el nombre!</Text>
      )}
    </MainLayout>
  );
  }

  // 4. SCORING (CON RESTRICCIÓN)
  if (gameState === 'SCORING') {
    const currentDj = players[djIndex];
    const isMyTurn = currentDj?.id === myId; // Solo el DJ califica

    return (
    <MainLayout showExit>
      <Text style={styles.neonTitle}>RESULTADOS</Text>
      
      <GlassCard style={{marginVertical: 15, padding: 15}}>
         <Text style={styles.sectionHeader}>LA CANCIÓN ERA:</Text>
         <Text style={styles.songTitle}>{currentSong.title}</Text>
         <Text style={styles.songArtist}>{currentSong.artist}</Text>
      </GlassCard>

      <ScrollView style={{width: '100%', flex: 1}}>
        {isMyTurn ? (
            // --- VISTA DJ (BOTONES ACTIVOS) ---
            <>
                <Text style={styles.sectionHeader}>TOCA QUIEN ADIVINÓ:</Text>
                {players.map((p, i) => (
                i !== djIndex && (
                    <TouchableOpacity key={p.id} onPress={() => handleScore('GUESSED', p.id)}>
                    <LinearGradient colors={[THEME.bg, '#222']} style={styles.scorePill}>
                        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                            <Text style={styles.playerText}>🙋‍♂️ {p.name}</Text>
                            <Text style={styles.pillScore}>{p.score} pts</Text>
                        </View>
                    </LinearGradient>
                    </TouchableOpacity>
                )
                ))}
                <Text style={[styles.sectionHeader, {marginTop: 20}]}>O CALIFÍCATE A TI:</Text>
                <NeonButton title="BUENA ROLA (+2)" colors={THEME.gradientGreen} onPress={() => handleScore('GOOD_SONG')} style={{marginBottom: 10}}/>
                <NeonButton title="MALA ROLA (-2)" colors={THEME.gradientRed} onPress={() => handleScore('BAD_SONG')}/>
            </>
        ) : (
            // --- VISTA PÚBLICO (SOLO VER) ---
            <>
                <Text style={styles.instruction}>El DJ está decidiendo los puntos...</Text>
                {players.map((p) => (
                    <View key={p.id} style={styles.playerPill}>
                         <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                            <Text style={styles.playerText}>{p.name}</Text>
                            <Text style={styles.pillScore}>{p.score}</Text>
                        </View>
                    </View>
                ))}
            </>
        )}
      </ScrollView>
    </MainLayout>
  );
  }

  // 5. WINNER
  if (gameState === 'WINNER') {
    const winner = players.sort((a,b) => b.score - a.score)[0];
    return (
      <MainLayout>
        <Text style={styles.neonTitle}>¡CAMPEÓN!</Text>
        <Text style={styles.bigNeonName}>{winner?.name}</Text>
        <Text style={styles.neonSubtitle}>{winner?.score} PUNTOS</Text>

        <ScrollView style={{width: '100%', maxHeight: 200, marginVertical: 30}}>
             {players.map(p => (
                 <View key={p.id} style={styles.row}>
                     <Text style={{color: 'white', fontSize: 18}}>{p.name}</Text>
                     <Text style={{color: THEME.cyan, fontSize: 18, fontWeight: 'bold'}}>{p.score}</Text>
                 </View>
             ))}
        </ScrollView>
        <NeonButton title="REINICIAR SALA" colors={THEME.gradientGold} onPress={resetGame} />
      </MainLayout>
    );
  }
  return null;
}

// Layout Wrapper
const MainLayout = ({children, showExit}) => (
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
  neonTitle: { fontSize: 36, fontWeight: 'bold', color: 'white', textShadowColor: THEME.cyan, textShadowRadius: 15, textAlign: 'center' },
  neonSubtitle: { fontSize: 18, color: THEME.cyan, letterSpacing: 2, marginBottom: 20, textAlign: 'center' },
  roleTitle: { fontSize: 16, color: THEME.pink, letterSpacing: 4, fontWeight: 'bold', textTransform: 'uppercase' },
  bigNeonName: { fontSize: 40, fontWeight: 'bold', color: 'white', textShadowColor: THEME.pink, textShadowRadius: 20, marginVertical: 5, textAlign: 'center' },
  instruction: { color: '#ccc', fontSize: 14, textAlign: 'center' },
  sectionHeader: { color: '#888', marginBottom: 10, textTransform: 'uppercase', fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
  songTitle: { color: 'white', fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 5 },
  songArtist: { color: THEME.cyan, fontSize: 18, textAlign: 'center' },
  glassCard: { width: '100%', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: THEME.glassBorder },
  input: { backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', padding: 15, borderRadius: 10, fontSize: 16, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  list: { maxHeight: 150, width: '100%' },
  playerPill: { backgroundColor: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 8, marginBottom: 5 },
  playerText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  pillScore: { color: THEME.cyan, fontSize: 16, fontWeight: 'bold' },
  scoreOption: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  scoreOptionSelected: { backgroundColor: THEME.cyan, borderColor: THEME.cyan },
  scoreOptionText: { color: '#666', fontWeight: 'bold' },
  btnContainer: { width: '100%', borderRadius: 12, overflow: 'hidden', height: 50, marginVertical: 5 },
  btnGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  btnText: { color: 'black', fontWeight: '900', fontSize: 16, letterSpacing: 1 },
  bigButton: { marginTop: 30, height: 60 },
  timerContainer: { alignItems: 'center', justifyContent: 'center', marginBottom: 40, marginTop: 40 },
  timerCircle: { width: 200, height: 200, borderRadius: 100, padding: 3, justifyContent: 'center', alignItems: 'center' },
  timerInner: { width: 180, height: 180, borderRadius: 90, backgroundColor: '#050505', justifyContent: 'center', alignItems: 'center' },
  timerText: { color: 'white', fontSize: 70, fontWeight: 'bold' },
  scorePill: { padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#333', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderColor: '#333' },
  endGameBtn: { marginTop: 20, padding: 10 },
});