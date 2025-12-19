import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Alert, ImageBackground, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

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
  purple: '#9D00FF', 
  red: '#FF0000',
  gradientPrimary: ['#00F0FF', '#FF00AA'], 
  gradientGreen: ['#00FF94', '#00B8FF'], 
  gradientRed: ['#FF2E2E', '#A80000'], 
  gradientPurple: ['#6C5CE7', '#a29bfe'], 
  gradientGold: ['#FFD700', '#FF8C00'],
  gradientGray: ['#333', '#111'],
  spotify: ['#1DB954', '#191414'],
  youtube: ['#FF0000', '#282828'],
};

const WINNING_OPTIONS = [10, 25, 50, 100];
const BACKGROUND_IMAGE = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=2070&auto=format&fit=crop';
const ROOM_ID = 'fiesta-navidad'; 

export default function App() {
  // --- IDENTIDAD LOCAL ---
  const [myId, setMyId] = useState(null); 
  const [myName, setMyName] = useState('');
  
  // Input del DJ
  const [songInput, setSongInput] = useState({ artist: '', title: '' });
  
  // Input del JUGADOR
  const [myGuess, setMyGuess] = useState({ artist: '', title: '' }); 
  const [hasSubmitted, setHasSubmitted] = useState(false); 
  
  // Estados de Firebase
  const [gameState, setGameState] = useState('SETUP');
  const [players, setPlayers] = useState([]);
  const [guesses, setGuesses] = useState({}); 
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
        setGuesses(data.guesses || {}); 
        
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

  // --- TIMER ---
  useEffect(() => {
    let interval = null;
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

  // --- NUEVO: AUTO-AVANCE CUANDO TODOS ADIVINAN ---
  useEffect(() => {
      // Si estamos adivinando y hay respuestas
      if (gameState === 'GUESSING' && guesses && players.length > 1) {
          const numGuesses = Object.keys(guesses).length;
          const numPlayersGuessing = players.length - 1; // Todos menos el DJ

          // Si ya respondieron todos...
          if (numGuesses >= numPlayersGuessing) {
              const iAmDj = players[djIndex]?.id === myId;
              // Solo el DJ (o el primero que lo detecte) manda la señal para evitar saturar la BD
              if (iAmDj) {
                  update(ref(database, ROOM_ID), { activeTimer: false, gameState: 'SCORING' });
              }
          }
      }
  }, [guesses, gameState, players, djIndex, myId]);


  // --- RESET LOCAL STATE AL CAMBIAR DE RONDAS ---
  useEffect(() => {
    if (gameState === 'GUESSING') {
        setHasSubmitted(false);
        setMyGuess({ artist: '', title: '' }); 
    }
  }, [gameState]);


  // --- ACCIONES ---
  const addPlayer = async () => {
    if (myName.trim()) {
      const newPlayerRef = push(ref(database, `${ROOM_ID}/players`), { 
        name: myName, 
        score: 0 
      });
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
        djIndex: randomDj,
        guesses: null 
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
        gameState: 'GUESSING',
        guesses: null 
    });
    setSongInput({ artist: '', title: '' });
  };

  const stopTimer = () => {
    update(ref(database, ROOM_ID), { activeTimer: false, gameState: 'SCORING' });
  };

  // --- ENVIAR RESPUESTA ---
  const sendGuess = (type, data = null) => {
      let textContent = '';
      
      if (type === 'GUESS') {
         textContent = `${data.title} - ${data.artist}`;
      } else if (type === 'RESPECT') {
         textContent = '😎 Se rifó el DJ';
      } else {
         textContent = '🍅 Maten al DJ';
      }

      const guessData = {
          playerId: myId,
          playerName: players.find(p => p.id === myId)?.name,
          type: type,
          text: textContent,
          timestamp: Date.now()
      };
      
      push(ref(database, `${ROOM_ID}/guesses`), guessData);
      setHasSubmitted(true); 
  };


  const handleScore = (type, playerKey = null) => {
    const updates = {};
    const currentPlayer = players[djIndex];
    
    if (type === 'GUESSED' && playerKey) {
       // El jugador adivinó -> Punto para el jugador
       const winner = players.find(p => p.id === playerKey);
       updates[`players/${playerKey}/score`] = winner.score + 1;

    } else if (type === 'DJ_BONUS') {
       // CORREGIDO: "Se rifó el DJ" -> El DJ gana 2 puntos
       updates[`players/${currentPlayer.id}/score`] = currentPlayer.score + 2;

    } else if (type === 'DJ_PENALTY') {
       // "Maten al DJ" -> El DJ pierde 2 puntos
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
            currentSong: {artist: '', title: ''},
            guesses: null
        });
    }
  };

  const resetGame = () => {
    remove(ref(database, ROOM_ID)); 
    setMyId(null); 
  };

  const forceEndGame = () => {
    Alert.alert("Terminar Juego", "¿Forzar final?", [
        { text: "Cancelar" },
        { text: "Sí", onPress: () => update(ref(database, ROOM_ID), { gameState: 'WINNER' }) }
    ]);
  };

  const openMusicApp = (app) => {
    const query = `${songInput.title} ${songInput.artist}`;
    const encodedQuery = encodeURIComponent(query);
    if (app === 'spotify') {
        const url = `https://open.spotify.com/search/${encodedQuery}`;
        Linking.openURL(url);
    } else if (app === 'youtube') {
        const url = `https://www.youtube.com/results?search_query=${encodedQuery}`;
        Linking.openURL(url);
    }
  };

  // --- UI COMPONENTS ---
  const NeonButton = ({ title, onPress, colors = THEME.gradientPrimary, style, disabled, icon }) => (
    <TouchableOpacity onPress={onPress} style={[styles.btnContainer, style, disabled && {opacity: 0.5}]} disabled={disabled}>
      <LinearGradient colors={disabled ? THEME.gradientGray : colors} start={{x:0, y:0}} end={{x:1, y:0}} style={styles.btnGradient}>
        <Text style={[styles.btnText, disabled && {color: '#ccc'}]}>{icon ? icon + ' ' : ''}{title}</Text>
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

  const getPlayerGuess = (pid) => {
      if (!guesses) return null;
      const guessArray = Object.values(guesses);
      return guessArray.find(g => g.playerId === pid);
  };

  // --- PANTALLAS ---
  
  // 1. LOBBY
  if (gameState === 'SETUP') {
    if (myId) {
      return (
        <MainLayout>
          <EmergencyReset onReset={resetGame} /> 
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
          <NeonButton title="INICIAR FIESTA" onPress={startGame} style={styles.bigButton} />
        </MainLayout>
      );
    }
    return (
    <MainLayout>
      <EmergencyReset onReset={resetGame} /> 
      <Text style={styles.neonTitle}>JUKEBOX</Text>
      <GlassCard style={{marginTop: 20}}>
        <TextInput style={styles.input} placeholder="Tu Nombre..." placeholderTextColor="#666" value={myName} onChangeText={setMyName} />
        <NeonButton title="ENTRAR" onPress={addPlayer} />
      </GlassCard>
      <View style={{marginTop: 20, width: '100%'}}>
        <Text style={styles.sectionHeader}>META DE PUNTOS: {winningScore}</Text>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', gap: 10}}>
          {WINNING_OPTIONS.map(score => (
             <TouchableOpacity key={score} onPress={() => updateWinningScore(score)} style={[styles.scoreOption, winningScore === score && styles.scoreOptionSelected]}>
                <Text style={[styles.scoreOptionText, winningScore === score && {color: 'black', fontWeight: 'bold'}]}>{score}</Text>
             </TouchableOpacity>
          ))}
        </View>
      </View>
    </MainLayout>
  );
  }

  // 2. DJ SPOTLIGHT
  if (gameState === 'DJ') {
    const currentDj = players[djIndex];
    const isMyTurn = currentDj?.id === myId; 
    return (
    <MainLayout showExit>
      <EmergencyReset onReset={resetGame} /> 
      <Text style={styles.roleTitle}>TURNO DE DJ</Text>
      <Text style={styles.bigNeonName}>{currentDj?.name}</Text>
      {isMyTurn ? (
        <GlassCard style={{marginTop: 20, borderColor: THEME.cyan}}>
          <Text style={[styles.instruction, {marginBottom: 10, color: THEME.cyan}]}>TE TOCA: Elige canción secreta</Text>
          <TextInput style={styles.input} placeholder="Canción..." placeholderTextColor="#555" value={songInput.title} onChangeText={(t) => setSongInput({...songInput, title: t})} />
          <TextInput style={styles.input} placeholder="Artista..." placeholderTextColor="#555" value={songInput.artist} onChangeText={(t) => setSongInput({...songInput, artist: t})} />
          {(songInput.title.length > 0 || songInput.artist.length > 0) && (
             <View style={{flexDirection: 'row', gap: 10, marginBottom: 15}}>
                <NeonButton title="Spotify" icon="🟢" colors={THEME.spotify} onPress={() => openMusicApp('spotify')} style={{flex: 1, height: 40}} />
                <NeonButton title="YouTube" icon="🔴" colors={THEME.youtube} onPress={() => openMusicApp('youtube')} style={{flex: 1, height: 40}} />
             </View>
          )}
          <NeonButton title="¡DALE PLAY!" onPress={startRound} style={{marginTop: 10}} />
        </GlassCard>
      ) : (
        <GlassCard style={{marginTop: 20}}>
           <Text style={{color: '#666', textAlign: 'center', fontSize: 18}}>🤫 El DJ está eligiendo...</Text>
           <View style={{marginTop: 20, alignItems: 'center'}}><Text style={{fontSize: 40}}>💿</Text></View>
        </GlassCard>
      )}
      <TouchableOpacity onPress={forceEndGame} style={styles.endGameBtn}><Text style={{color:'red'}}>Terminar Juego</Text></TouchableOpacity>
    </MainLayout>
  );
  }

  // 3. GUESSING
  if (gameState === 'GUESSING') {
    const currentDj = players[djIndex];
    const isMyTurn = currentDj?.id === myId; 
    
    const sortedGuesses = guesses ? Object.values(guesses).sort((a,b) => a.timestamp - b.timestamp) : [];

    return (
    <MainLayout showExit>
      <EmergencyReset onReset={resetGame} /> 
      <View style={styles.timerContainer}>
         <LinearGradient colors={timer < 10 ? THEME.gradientRed : THEME.gradientPrimary} style={styles.timerCircle}>
            <View style={styles.timerInner}>
               <Text style={styles.timerText}>{timer}</Text>
            </View>
         </LinearGradient>
      </View>
      
      {isMyTurn ? (
         <>
            <Text style={styles.instruction}>RESPUESTAS EN VIVO:</Text>
            <ScrollView style={{maxHeight: 200, width: '100%', marginBottom: 20}}>
               {sortedGuesses.length === 0 && <Text style={{color: '#666', textAlign: 'center'}}>Esperando...</Text>}
               {sortedGuesses.map((g, i) => (
                  <View key={i} style={styles.guessRow}>
                      <Text style={{color: THEME.cyan, fontWeight: 'bold'}}>#{i+1} {g.playerName}</Text>
                      <Text style={{color: 'white'}}>
                          {g.type === 'GUESS' ? `📝 ${g.text}` : (g.type === 'RESPECT' ? '😎 SE RIFÓ' : '🍅 MATEN AL DJ')}
                      </Text>
                  </View>
               ))}
            </ScrollView>
            <NeonButton title="¡STOP / YA GANARON!" colors={THEME.gradientRed} onPress={stopTimer} />
         </>
      ) : (
         <GlassCard>
             {hasSubmitted ? (
                 <View style={{alignItems: 'center'}}>
                     <Text style={{fontSize: 40}}>✅</Text>
                     <Text style={styles.instruction}>¡Respuesta Enviada!</Text>
                     <Text style={{color: '#666', marginTop: 10}}>Espera a que el DJ decida.</Text>
                 </View>
             ) : (
                 <>
                    <Text style={[styles.instruction, {marginBottom: 15}]}>¿Te la sabes?</Text>
                    
                    <TextInput 
                        style={styles.input} 
                        placeholder="Nombre de la Canción..." 
                        placeholderTextColor="#555"
                        value={myGuess.title}
                        onChangeText={(t) => setMyGuess({...myGuess, title: t})}
                    />
                    
                    <TextInput 
                        style={styles.input} 
                        placeholder="Artista / Banda..." 
                        placeholderTextColor="#555"
                        value={myGuess.artist}
                        onChangeText={(t) => setMyGuess({...myGuess, artist: t})}
                    />

                    <NeonButton 
                        title="¡ME LA SÉ! (ENVIAR)" 
                        onPress={() => sendGuess('GUESS', myGuess)} 
                        disabled={!myGuess.title.trim() || !myGuess.artist.trim()}
                        style={{marginBottom: 20}}
                    />

                    <View style={{flexDirection: 'row', gap: 10}}>
                        
                        <TouchableOpacity 
                            style={[styles.voteBtn, {borderColor: THEME.purple, backgroundColor: 'rgba(108, 92, 231, 0.2)'}]}
                            onPress={() => sendGuess('RESPECT')}
                        >
                            <Text style={{fontSize: 20}}>😎</Text>
                            <Text style={{color: 'white', fontSize: 10, textAlign: 'center', fontWeight:'bold'}}>Se rifó el DJ</Text>
                            <Text style={{color: '#aaa', fontSize: 8, textAlign: 'center'}}>(Gana 2 pts)</Text>
                        </TouchableOpacity>

                         <TouchableOpacity 
                            style={[styles.voteBtn, {borderColor: THEME.red, backgroundColor: 'rgba(255, 0, 0, 0.1)'}]}
                            onPress={() => sendGuess('KILL')}
                        >
                            <Text style={{fontSize: 20}}>🍅</Text>
                            <Text style={{color: 'white', fontSize: 10, textAlign: 'center', fontWeight:'bold'}}>Maten al DJ</Text>
                            <Text style={{color: '#aaa', fontSize: 8, textAlign: 'center'}}>(Castigo)</Text>
                        </TouchableOpacity>
                    </View>
                 </>
             )}
         </GlassCard>
      )}
    </MainLayout>
  );
  }

  // 4. SCORING
  if (gameState === 'SCORING') {
    const currentDj = players[djIndex];
    const isMyTurn = currentDj?.id === myId; 

    return (
    <MainLayout showExit>
      <EmergencyReset onReset={resetGame} /> 
      <Text style={styles.neonTitle}>RESULTADOS</Text>
      
      <GlassCard style={{marginVertical: 15, padding: 15}}>
         <Text style={styles.sectionHeader}>LA CANCIÓN ERA:</Text>
         <Text style={styles.songTitle}>{currentSong.title}</Text>
         <Text style={styles.songArtist}>{currentSong.artist}</Text>
      </GlassCard>

      <ScrollView style={{width: '100%', flex: 1}}>
        {isMyTurn ? (
            <>
                <Text style={styles.sectionHeader}>¿QUIÉN ACERTÓ?</Text>
                <Text style={{fontSize: 10, color: '#666', textAlign: 'center', marginBottom: 10}}>(Toca al ganador)</Text>
                
                {players.map((p, i) => {
                  if (i === djIndex) return null;
                  const guess = getPlayerGuess(p.id);
                  return (
                    <TouchableOpacity key={p.id} onPress={() => handleScore('GUESSED', p.id)}>
                    <LinearGradient colors={[THEME.bg, '#222']} style={styles.scorePill}>
                        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                            <View style={{flex: 1}}>
                                <Text style={styles.playerText}>{p.name}</Text>
                                {guess && (
                                    <Text style={{color: guess.type === 'GUESS' ? THEME.cyan : (guess.type === 'RESPECT' ? THEME.purple : THEME.red), fontSize: 12}}>
                                        {guess.type === 'GUESS' ? `📝 ${guess.text}` : (guess.type === 'RESPECT' ? '😎 Dijo: Se rifó el DJ' : '🍅 Dijo: Maten al DJ')}
                                    </Text>
                                )}
                            </View>
                            <Text style={styles.pillScore}>{p.score} pts</Text>
                        </View>
                    </LinearGradient>
                    </TouchableOpacity>
                  );
                })}

                <Text style={[styles.sectionHeader, {marginTop: 20}]}>CALIFÍCATE A TI (DJ):</Text>
                
                <NeonButton 
                    title="BONUS: SE RIFÓ (+2 pts)" 
                    colors={THEME.gradientPurple} 
                    onPress={() => handleScore('DJ_BONUS')} 
                    style={{marginBottom: 10}}
                    icon="😎"
                />
                <NeonButton 
                    title="CASTIGO: MATEN AL DJ (-2 pts)" 
                    colors={THEME.gradientRed} 
                    onPress={() => handleScore('DJ_PENALTY')}
                    icon="🍅"
                />
            </>
        ) : (
            <>
                <Text style={styles.instruction}>El DJ está revisando respuestas...</Text>
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
        <EmergencyReset onReset={resetGame} /> 
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

// --- COMPONENTE DE EMERGENCIA ---
const EmergencyReset = ({ onReset }) => (
  <TouchableOpacity onPress={() => { if (confirm("⚠️ ¿REINICIAR TODO?")) { onReset(); } }} style={{ position: 'absolute', top: 50, right: 20, backgroundColor: 'rgba(255, 0, 0, 0.4)', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', zIndex: 9999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
    <Text style={{fontSize: 20}}>🔄</Text>
  </TouchableOpacity>
);

// Layout Wrapper
const MainLayout = ({children, showExit}) => (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ImageBackground source={{uri: BACKGROUND_IMAGE}} style={styles.bgImage} resizeMode="cover">
          <BlurView intensity={90} tint="dark" style={styles.blurContainer}>{children}</BlurView>
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
  timerContainer: { alignItems: 'center', justifyContent: 'center', marginBottom: 20, marginTop: 20 },
  timerCircle: { width: 150, height: 150, borderRadius: 100, padding: 3, justifyContent: 'center', alignItems: 'center' },
  timerInner: { width: 130, height: 130, borderRadius: 90, backgroundColor: '#050505', justifyContent: 'center', alignItems: 'center' },
  timerText: { color: 'white', fontSize: 50, fontWeight: 'bold' },
  scorePill: { padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#333', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderColor: '#333' },
  endGameBtn: { marginTop: 20, padding: 10 },
  guessRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, borderBottomWidth: 1, borderColor: '#333' },
  voteBtn: { flex: 1, padding: 15, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)'}
});