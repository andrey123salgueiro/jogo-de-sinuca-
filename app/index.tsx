/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Platform,
  SafeAreaView,
  StatusBar
} from 'react-native';
import {
  HelpCircle,
  Volume2,
  VolumeX,
  RotateCcw,
  Users,
  User,
  Cpu,
  Trophy,
  History,
  Palette,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

import { GameMode, Ball, BallType, GameLog } from '../src/types';
import { initializeBalls, findSafeCueBallSpot, TABLE_WIDTH, TABLE_HEIGHT } from '../src/utils/poolEngine';
import { playFoulSound, playVictorySound, setSoundVolume } from '../src/utils/audio';
import PoolTable from '../src/components/PoolTable';

export default function GameScreen() {
  // Game Setup States
  const [balls, setBalls] = useState<Ball[]>([]);
  const [mode, setMode] = useState<GameMode>(GameMode.TWO_PLAYERS);
  const [currentPlayer, setCurrentPlayer] = useState<1 | 2>(1);
  const [ballTypeAssigned, setBallTypeAssigned] = useState<[BallType | null, BallType | null]>([null, null]);
  const [cueBallInHand, setCueBallInHand] = useState<boolean>(true);
  
  // Game Status
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [winnerName, setWinnerName] = useState<string | null>(null);
  const [shotsTaken, setShotsTaken] = useState<number>(0);
  const [logs, setLogs] = useState<GameLog[]>([]);
  
  // Configs
  const [themeColor, setThemeColor] = useState<'green' | 'blue' | 'red' | 'dark'>('green');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showRulesModal, setShowRulesModal] = useState<boolean>(false);

  // Initializing new game on load
  useEffect(() => {
    startNewGame(mode);
  }, []);

  // Update volume hook
  useEffect(() => {
    setSoundVolume(isMuted ? 0 : 0.5);
  }, [isMuted]);

  // Log logger utility
  const addLog = (message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const newLog: GameLog = {
      id: Math.random().toString(36).substring(3),
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour12: false }),
      message,
      type
    };
    setLogs(prev => [newLog, ...prev].slice(0, 50)); // limit to 50 logs
  };

  const startNewGame = (selectedMode: GameMode) => {
    const freshlyBakedBalls = initializeBalls(TABLE_WIDTH, TABLE_HEIGHT);
    setBalls(freshlyBakedBalls);
    setMode(selectedMode);
    setCurrentPlayer(1);
    setBallTypeAssigned([null, null]);
    setCueBallInHand(true);
    setIsGameOver(false);
    setWinnerName(null);
    setShotsTaken(0);
    
    // Welcome logs
    setLogs([]);
    addLog('Jogo de Sinuca Inicializado!', 'success');
    if (selectedMode === GameMode.PRACTICE) {
      addLog('Modo Treino: Sem faltas ou oponentes. Livre para treinar tacadas!', 'info');
    } else if (selectedMode === GameMode.VS_AI) {
      addLog('Modo Contra o Computador: Enfrente a IA inteligente!', 'info');
    } else {
      addLog('Modo 2 Jogadores: Pass-and-play local. Jogador 1 começa.', 'info');
    }
  };

  // List of active remaining target balls
  const solidsRemaining = balls.filter(b => b.type === BallType.SOLID && !b.isSunk);
  const stripesRemaining = balls.filter(b => b.type === BallType.STRIPE && !b.isSunk);
  const isEightBallSunk = balls.find(b => b.type === BallType.EIGHT)?.isSunk ?? false;

  // Handles standard 8-ball rules turn evaluations
  const handleTurnFinished = (sunkThisTurn: Ball[], collidedFirstWith: number | null) => {
    setShotsTaken(prev => prev + 1);

    // If Practice mode:
    if (mode === GameMode.PRACTICE) {
      const isCueSunk = sunkThisTurn.some(b => b.type === BallType.CUE);
      if (isCueSunk) {
        addLog('Bola branca encaçapada! Reposicione-a na mesa.', 'warn');
        playFoulSound();
        resetCueBallToSafeSpot();
      }

      if (isEightBallSunk) {
        const othersRemaining = balls.filter(b => b.id !== 0 && b.type !== BallType.EIGHT && !b.isSunk);
        if (othersRemaining.length === 0) {
          setIsGameOver(true);
          setWinnerName('Campeão da Mesa');
          playVictorySound();
          addLog('Excelente! Você limpou a mesa no Modo Treino!', 'success');
        } else {
          addLog('A bola preta 8 caiu antes da hora! Reiniciando apenas ela.', 'error');
          playFoulSound();
          setBalls(prev => prev.map(b => b.type === BallType.EIGHT ? { ...b, isSunk: false, sinkingProgress: 1.0, x: TABLE_WIDTH * 0.75, y: TABLE_HEIGHT * 0.5 } : b));
        }
      }
      return;
    }

    // MULTIPLAYER OR VS AI RULES:
    const activePlayerNum = currentPlayer;
    const opponentPlayerNum = currentPlayer === 1 ? 2 : 1;
    const activePlayerName = mode === GameMode.VS_AI && activePlayerNum === 2 ? 'Computador' : `Jogador ${activePlayerNum}`;
    const opponentPlayerName = mode === GameMode.VS_AI && opponentPlayerNum === 2 ? 'Computador' : `Jogador ${opponentPlayerNum}`;

    const activeType = ballTypeAssigned[activePlayerNum - 1];
    const opponentType = ballTypeAssigned[opponentPlayerNum - 1];

    let hasFoul = false;
    let switchTurn = true;
    let foulReason = '';

    // RULE A: Cue Ball Pocketed
    const wasCueSunk = sunkThisTurn.some(b => b.type === BallType.CUE);
    if (wasCueSunk) {
      hasFoul = true;
      foulReason = 'Bola branca na caçapa!';
      addLog(`FALTA de ${activePlayerName}: Encaçapou a bola branca!`, 'error');
      playFoulSound();
      
      resetCueBallToSafeSpot();
      setCueBallInHand(true);
    }

    // RULE B: First Contact checks
    if (!hasFoul && collidedFirstWith !== null) {
      const hitBall = balls.find(b => b.id === collidedFirstWith);
      if (hitBall) {
        if (activeType === BallType.SOLID && hitBall.type === BallType.STRIPE) {
          hasFoul = true;
          foulReason = 'Tocou bola listrada primeiro (adversária)!';
          addLog(`FALTA de ${activePlayerName}: Atingiu bola listrada primeiro!`, 'error');
          playFoulSound();
        } else if (activeType === BallType.STRIPE && hitBall.type === BallType.SOLID) {
          hasFoul = true;
          foulReason = 'Tocou bola sólida primeiro (adversária)!';
          addLog(`FALTA de ${activePlayerName}: Atingiu bola sólida primeiro!`, 'error');
          playFoulSound();
        } else if (hitBall.type === BallType.EIGHT) {
          const activeOwnRemaining = activeType === BallType.SOLID ? solidsRemaining : stripesRemaining;
          const hasOwnLeft = activeType !== null && activeOwnRemaining.length > 0;
          if (hasOwnLeft) {
            hasFoul = true;
            foulReason = 'Atingiu a bola preta 8 primeiro sem limpar sua série!';
            addLog(`FALTA de ${activePlayerName}: Tocou a bola 8 antes de limpar suas bolas!`, 'error');
            playFoulSound();
          }
        }
      }
    } else if (!hasFoul && collidedFirstWith === null) {
      hasFoul = true;
      foulReason = 'A tacada não tocou em nenhuma bola!';
      addLog(`FALTA de ${activePlayerName}: A bola branca não bateu em nada!`, 'error');
      playFoulSound();
    }

    if (hasFoul && !wasCueSunk) {
      setCueBallInHand(true);
    }

    // RULE C: Ball 8 End game conditions
    const wasEightSunk = sunkThisTurn.some(b => b.type === BallType.EIGHT);
    if (wasEightSunk) {
      setIsGameOver(true);
      const activeOwnRemaining = activeType === BallType.SOLID ? solidsRemaining : stripesRemaining;
      const ownsRemainingCount = activeType === null ? 7 : activeOwnRemaining.length;

      if (ownsRemainingCount === 0 && !hasFoul) {
        setWinnerName(activePlayerName);
        addLog(`FIM DE JOGO! Vitória do ${activePlayerName}! Encaçapou a bola 8 perfeitamente!`, 'success');
        playVictorySound();
      } else {
        setWinnerName(opponentPlayerName);
        const detailStr = hasFoul 
          ? `cometeu uma falta (${foulReason})!` 
          : `ainda possuía ${ownsRemainingCount} bolas restantes!`;
        addLog(`FIM DE JOGO! Caçapa ilegal da bola 8 por ${activePlayerName} (${detailStr}). Vitória de ${opponentPlayerName}!`, 'error');
        playFoulSound();
      }
      return;
    }

    // Determine pocket clearances
    const activeOwnSunkThisTurn = sunkThisTurn.filter(b => b.type === activeType);
    const solidsSunkThisTurn = sunkThisTurn.filter(b => b.type === BallType.SOLID);
    const stripesSunkThisTurn = sunkThisTurn.filter(b => b.type === BallType.STRIPE);

    // RULE D: Assign Category Patterns if table was OPEN
    if (!hasFoul && ballTypeAssigned[0] === null && (solidsSunkThisTurn.length > 0 || stripesSunkThisTurn.length > 0)) {
      const firstSunk = sunkThisTurn.find(b => b.type === BallType.SOLID || b.type === BallType.STRIPE);
      if (firstSunk) {
        const p1Type = activePlayerNum === 1 ? firstSunk.type : (firstSunk.type === BallType.SOLID ? BallType.STRIPE : BallType.SOLID);
        const p2Type = p1Type === BallType.SOLID ? BallType.STRIPE : BallType.SOLID;
        
        setBallTypeAssigned([p1Type, p2Type]);
        addLog(`Séries Definidas! Jogador 1: ${p1Type === BallType.SOLID ? 'SÓLIDAS' : 'LISTRADAS'} | Jogador 2: ${p2Type === BallType.SOLID ? 'SÓLIDAS' : 'LISTRADAS'}`, 'success');
        
        switchTurn = false;
        addLog(`${activePlayerName} encaçapou bola válida e continua na mesa!`, 'success');
      }
    } else if (!hasFoul && activeType !== null) {
      if (activeOwnSunkThisTurn.length > 0) {
        switchTurn = false;
        addLog(`${activePlayerName} encaçapou bola da sua série e ganhou mais um tiro!`, 'success');
      } else if (sunkThisTurn.filter(b => b.id !== 0).length > 0) {
        addLog(`${activePlayerName} encaçapou apenas bolas do oponente. Turno passado.`, 'warn');
      }
    }

    sunkThisTurn.forEach(b => {
      if (b.type === BallType.SOLID) {
        addLog(`Caçapa: Bola sólida Nº ${b.number} caiu.`, 'info');
      } else if (b.type === BallType.STRIPE) {
        addLog(`Caçapa: Bola listrada Nº ${b.number} caiu.`, 'info');
      }
    });

    if (hasFoul || switchTurn) {
      setCurrentPlayer(opponentPlayerNum);
      addLog(`Vez de: ${opponentPlayerName}`, 'info');
    }
  };

  const resetCueBallToSafeSpot = () => {
    setBalls(prev => {
      const copy = [...prev];
      const safe = findSafeCueBallSpot(copy);
      copy[0] = { ...copy[0], x: safe.x, y: safe.y, vx: 0, vy: 0, isSunk: false, sinkingProgress: 1.0 };
      return copy;
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#090d16" />
      <View style={styles.appContainer}>
        
        {/* HEADER BAR */}
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <View style={styles.logoIcon}>
              <Text style={styles.logoIconText}>8</Text>
            </View>
            <View>
              <Text style={styles.logoTitle}>Sinuca Real Expo</Text>
              <Text style={styles.logoSubtitle}>Modo Expo Router Ativo</Text>
            </View>
          </View>

          <View style={styles.toolbar}>
            {/* Rules Button */}
            <TouchableOpacity
              style={styles.toolBtn}
              onPress={() => setShowRulesModal(true)}
              activeOpacity={0.7}
            >
              <HelpCircle color="#a1a1aa" size={20} />
            </TouchableOpacity>

            {/* Mute Button */}
            <TouchableOpacity
              style={styles.toolBtn}
              onPress={() => setIsMuted(!isMuted)}
              activeOpacity={0.7}
            >
              {isMuted ? (
                <VolumeX color="#f43f5e" size={20} />
              ) : (
                <Volume2 color="#10b981" size={20} />
              )}
            </TouchableOpacity>

            {/* Colors customizer dots */}
            <View style={styles.colorPalette}>
              <Palette color="#a1a1aa" size={14} style={{ marginRight: 4 }} />
              <TouchableOpacity
                style={[styles.colorDot, { backgroundColor: '#047857' }, themeColor === 'green' && styles.activeColorDot]}
                onPress={() => setThemeColor('green')}
              />
              <TouchableOpacity
                style={[styles.colorDot, { backgroundColor: '#1d4ed8' }, themeColor === 'blue' && styles.activeColorDot]}
                onPress={() => setThemeColor('blue')}
              />
              <TouchableOpacity
                style={[styles.colorDot, { backgroundColor: '#991b1b' }, themeColor === 'red' && styles.activeColorDot]}
                onPress={() => setThemeColor('red')}
              />
              <TouchableOpacity
                style={[styles.colorDot, { backgroundColor: '#3f3f46' }, themeColor === 'dark' && styles.activeColorDot]}
                onPress={() => setThemeColor('dark')}
              />
            </View>
          </View>
        </View>

        {/* CONTAINER GRID LAYOUT */}
        <View style={styles.mainContent}>
          
          {/* SIDEBAR NAVIGATION CONTROLS */}
          <View style={styles.sidebar}>
            
            {/* MODE BANNER CARD */}
            <View style={styles.sidebarCard}>
              <Text style={styles.cardHeaderTitle}>Modo de Jogo</Text>
              
              <TouchableOpacity
                style={[styles.modeBtn, mode === GameMode.TWO_PLAYERS && styles.activeModeBtn]}
                onPress={() => startNewGame(GameMode.TWO_PLAYERS)}
              >
                <Users color={mode === GameMode.TWO_PLAYERS ? '#f59e0b' : '#a1a1aa'} size={16} />
                <Text style={[styles.modeBtnText, mode === GameMode.TWO_PLAYERS && styles.activeModeBtnText]}>
                  2 Jogadores (Local)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeBtn, mode === GameMode.VS_AI && styles.activeModeBtn]}
                onPress={() => startNewGame(GameMode.VS_AI)}
              >
                <Cpu color={mode === GameMode.VS_AI ? '#f59e0b' : '#a1a1aa'} size={16} />
                <Text style={[styles.modeBtnText, mode === GameMode.VS_AI && styles.activeModeBtnText]}>
                  Contra Computador
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeBtn, mode === GameMode.PRACTICE && styles.activeModeBtn]}
                onPress={() => startNewGame(GameMode.PRACTICE)}
              >
                <User color={mode === GameMode.PRACTICE ? '#f59e0b' : '#a1a1aa'} size={16} />
                <Text style={[styles.modeBtnText, mode === GameMode.PRACTICE && styles.activeModeBtnText]}>
                  Modo Treino
                </Text>
              </TouchableOpacity>
            </View>

            {/* PLAYER STATUS PANEL (Conditionally displayed) */}
            {mode !== GameMode.PRACTICE && (
              <View style={styles.sidebarCard}>
                <View style={styles.turnIndicatorBanner}>
                  <Text style={styles.turnSubtitle}>VEZ DA TACADA</Text>
                  <Text style={[styles.turnTitle, currentPlayer === 1 ? { color: '#f59e0b' } : { color: '#10b981' }]}>
                    {mode === GameMode.VS_AI && currentPlayer === 2 ? 'Computador' : `Jogador ${currentPlayer}`}
                  </Text>
                  {cueBallInHand && (
                    <Text style={styles.handRuleCall}>Bola na mão!</Text>
                  )}
                </View>

                {/* Player 1 Card Details */}
                <View style={[styles.playerCardRow, currentPlayer === 1 && styles.activePlayerCardP1]}>
                  <View style={styles.pCardHeader}>
                    <Text style={styles.pCardLabel}>Jogador 1</Text>
                    <Text style={styles.pCardType}>
                      {ballTypeAssigned[0] === null ? 'Livre' : (ballTypeAssigned[0] === BallType.SOLID ? 'Sólidas' : 'Listradas')}
                    </Text>
                  </View>
                  <View style={styles.miniBallsRow}>
                    {Array.from({ length: 7 }).map((_, idx) => {
                      const number = ballTypeAssigned[0] === BallType.STRIPE ? (idx + 9) : (idx + 1);
                      const sBall = balls.find(b => b.number === number);
                      const isSunk = sBall ? sBall.isSunk : false;
                      const color = sBall ? sBall.color : '#444';

                      return (
                        <View
                          key={idx}
                          style={[
                            styles.miniBallIndicator,
                            { backgroundColor: isSunk ? '#27272a' : color },
                            isSunk && { opacity: 0.3 }
                          ]}
                        >
                          <Text style={styles.miniBallIndicatorText}>{number}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>

                {/* Player 2 Card Details */}
                <View style={[styles.playerCardRow, currentPlayer === 2 && styles.activePlayerCardP2]}>
                  <View style={styles.pCardHeader}>
                    <Text style={styles.pCardLabel}>
                      {mode === GameMode.VS_AI ? 'Computador' : 'Jogador 2'}
                    </Text>
                    <Text style={styles.pCardType}>
                      {ballTypeAssigned[1] === null ? 'Livre' : (ballTypeAssigned[1] === BallType.SOLID ? 'Sólidas' : 'Listradas')}
                    </Text>
                  </View>
                  <View style={styles.miniBallsRow}>
                    {Array.from({ length: 7 }).map((_, idx) => {
                      const number = ballTypeAssigned[1] === BallType.STRIPE ? (idx + 9) : (idx + 1);
                      const sBall = balls.find(b => b.number === number);
                      const isSunk = sBall ? sBall.isSunk : false;
                      const color = sBall ? sBall.color : '#444';

                      return (
                        <View
                          key={idx}
                          style={[
                            styles.miniBallIndicator,
                            { backgroundColor: isSunk ? '#27272a' : color },
                            isSunk && { opacity: 0.3 }
                          ]}
                        >
                          <Text style={styles.miniBallIndicatorText}>{number}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={styles.restartBtn}
              onPress={() => startNewGame(mode)}
              activeOpacity={0.8}
            >
              <RotateCcw color="#d1d5db" size={15} />
              <Text style={styles.restartBtnText}>REINICIAR PARTIDA</Text>
            </TouchableOpacity>
          </View>

          {/* PLAYGROUND CANVAS & REALTIME VIRTUAL REFEREE ANNOUNCER */}
          <View style={styles.playground}>
            
            {/* WINNER ALERT ACCORDION BANNER */}
            {isGameOver && (
              <View style={styles.victoryCard}>
                <View style={styles.victoryIconBox}>
                  <Trophy color="#eab308" size={32} />
                </View>
                <View style={styles.victoryInfo}>
                  <Text style={styles.victoryMainHeader}>Mesa Concluída!</Text>
                  <Text style={styles.victoryDetail}>
                    Vitória triunfante de <Text style={{ fontWeight: 'bold' }}>{winnerName}</Text> em apenas {shotsTaken} tacadas!
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.playAgainBtn}
                  onPress={() => startNewGame(mode)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.playAgainBtnText}>REINICIAR</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* POOL CANVAS CONTAINER */}
            <View style={styles.canvasWrapperHorizontal}>
              <PoolTable
                balls={balls}
                setBalls={setBalls}
                mode={mode}
                currentPlayer={currentPlayer}
                allowedType={ballTypeAssigned[currentPlayer - 1]}
                cueBallInHand={cueBallInHand}
                setCueBallInHand={setCueBallInHand}
                onTurnFinished={handleTurnFinished}
                themeColor={themeColor}
                soundVolume={isMuted ? 0 : 0.5}
              />
            </View>

            {/* VIRTUAL REFEREE LOGS PANEL */}
            <View style={styles.logsConsole}>
              <View style={styles.consoleHeader}>
                <History color="#f59e0b" size={14} />
                <Text style={styles.consoleHeaderTitle}>Juiz Virtual / Histórico</Text>
              </View>
              <ScrollView style={styles.consoleScroll} nestedScrollEnabled={true}>
                {logs.length === 0 ? (
                  <Text style={styles.noLogsText}>Nenhuma tacada executada. Toque na mesa para mirar e atirar!</Text>
                ) : (
                  logs.map(log => {
                    let logStyle = styles.logInfo;
                    if (log.type === 'success') logStyle = styles.logSuccess;
                    if (log.type === 'warn') logStyle = styles.logWarn;
                    if (log.type === 'error') logStyle = styles.logError;

                    return (
                      <View key={log.id} style={styles.logLine}>
                        <Text style={styles.logTimestamp}>[{log.timestamp}]</Text>
                        <Text style={[styles.logText, logStyle]}>{log.message}</Text>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>

          </View>

        </View>

        {/* DETAILS OF POOL RULES MODAL CONTAINER */}
        <Modal
          visible={showRulesModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowRulesModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Regras Oficiais - Bola 8</Text>
              
              <ScrollView style={styles.modalScroll}>
                <View style={styles.ruleSection}>
                  <Text style={styles.ruleSectionTitle}>🏆 Objetivo do Jogo</Text>
                  <Text style={styles.ruleText}>
                    Encaçapar todas as bolas correspondentes da sua própria série (Sólidas ou Listradas) e depois finalizar encaçapando a bola preta 8 legalmente.
                  </Text>
                </View>

                <View style={styles.ruleSection}>
                  <Text style={styles.ruleSectionTitle}>🔵 Mesa Aberta</Text>
                  <Text style={styles.ruleText}>
                    No início da partida, a mesa está livre. O primeiro jogador a encaçapar uma bola sólida ou listrada define a série de cada competidor.
                  </Text>
                </View>

                <View style={styles.ruleSection}>
                  <Text style={styles.ruleSectionTitle}>⚠️ Faltas Principais</Text>
                  <Text style={styles.ruleText}>
                    Cometer uma falta concede "Bola na Mão" para o adversário re-posicionar livremente. Exemplos:
                  </Text>
                  <Text style={styles.ruleBullet}>• Encaçapar a bola branca.</Text>
                  <Text style={styles.ruleBullet}>• Tocar bola adversária diretamente primeiro.</Text>
                  <Text style={styles.ruleBullet}>• Não tocar em absolutamente nenhuma bola na tacada.</Text>
                </View>

                <View style={styles.ruleSection}>
                  <Text style={styles.ruleSectionTitle}>💀 Derrota Imediata</Text>
                  <Text style={styles.ruleText}>
                    Você perde a partida automaticamente se encaçapar a bola 8 preta antes de terminar todas as bolas da sua série, ou se cometer qualquer falta no mesmo tiro que derrubar a bola 8.
                  </Text>
                </View>
              </ScrollView>

              <TouchableOpacity
                style={styles.closeModalBtn}
                onPress={() => setShowRulesModal(false)}
              >
                <Text style={styles.closeModalBtnText}>ENTENDI E VOU JOGAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* FOOTER */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>© 2026 Sinuca Real • Física 2D Integrada Expo Router</Text>
        </View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  appContainer: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  header: {
    height: 60,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIconText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 18,
  },
  logoTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: 'bold',
  },
  logoSubtitle: {
    color: '#64748b',
    fontSize: 10,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  colorPalette: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    padding: 5,
    borderRadius: 8,
    gap: 3,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  activeColorDot: {
    borderWidth: 1.5,
    borderColor: '#ffffff',
    transform: [{ scale: 1.1 }],
  },
  mainContent: {
    flex: 1,
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    padding: 16,
    gap: 16,
  },
  sidebar: {
    flex: Platform.OS === 'web' ? 3 : undefined,
    flexDirection: 'column',
    gap: 12,
  },
  sidebarCard: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
  },
  cardHeaderTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#f59e0b',
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginBottom: 4,
    gap: 8,
  },
  activeModeBtn: {
    backgroundColor: '#1e293b',
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
  },
  modeBtnText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '500',
  },
  activeModeBtnText: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  turnIndicatorBanner: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#090d16',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  turnSubtitle: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#64748b',
    letterSpacing: 1.0,
  },
  turnTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  handRuleCall: {
    fontSize: 10,
    color: '#ef4444',
    fontStyle: 'italic',
    marginTop: 2,
  },
  playerCardRow: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#090d16',
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 8,
  },
  activePlayerCardP1: {
    borderColor: 'rgba(245, 158, 11, 0.5)',
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
  },
  activePlayerCardP2: {
    borderColor: 'rgba(16, 185, 129, 0.5)',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  pCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pCardLabel: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: 'bold',
  },
  pCardType: {
    color: '#94a3b8',
    fontSize: 9,
    fontFamily: 'monospace',
    backgroundColor: '#1e293b',
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  miniBallsRow: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  miniBallIndicator: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: '#000000',
  },
  miniBallIndicatorText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: 'bold',
  },
  restartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    gap: 8,
  },
  restartBtnText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: 'bold',
  },
  playground: {
    flex: Platform.OS === 'web' ? 9 : 1,
    flexDirection: 'column',
    gap: 16,
  },
  victoryCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  victoryIconBox: {
    padding: 10,
    backgroundColor: '#0f172a',
    borderRadius: 12,
  },
  victoryInfo: {
    flex: 1,
    marginLeft: 12,
  },
  victoryMainHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#eab308',
  },
  victoryDetail: {
    fontSize: 11,
    color: '#cbd5e1',
    marginTop: 2,
  },
  playAgainBtn: {
    backgroundColor: '#f59e0b',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  playAgainBtnText: {
    color: '#090d16',
    fontWeight: 'bold',
    fontSize: 11,
  },
  canvasWrapperHorizontal: {
    width: '100%',
    alignItems: 'center',
  },
  logsConsole: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
  },
  consoleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  consoleHeaderTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  consoleScroll: {
    height: 100,
    backgroundColor: '#020617',
    borderRadius: 8,
    padding: 8,
  },
  noLogsText: {
    color: '#475569',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 20,
  },
  logLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  logTimestamp: {
    fontSize: 10,
    color: '#475569',
    fontFamily: 'monospace',
    marginRight: 6,
  },
  logText: {
    fontSize: 11,
    fontFamily: 'monospace',
    flex: 1,
  },
  logInfo: {
    color: '#94a3b8',
  },
  logSuccess: {
    color: '#10b981',
    fontWeight: 'bold',
  },
  logWarn: {
    color: '#f59e0b',
  },
  logError: {
    color: '#f43f5e',
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#1e293b',
    width: '100%',
    maxWidth: 500,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#eab308',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalScroll: {
    maxHeight: 300,
  },
  ruleSection: {
    marginBottom: 14,
  },
  ruleSectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  ruleText: {
    fontSize: 11,
    color: '#cbd5e1',
    lineHeight: 16,
  },
  ruleBullet: {
    fontSize: 11,
    color: '#a1a1aa',
    marginLeft: 10,
    marginTop: 2,
  },
  closeModalBtn: {
    backgroundColor: '#eab308',
    borderRadius: 10,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  closeModalBtnText: {
    color: '#0f172a',
    fontWeight: 'bold',
    fontSize: 12,
  },
  footer: {
    height: 36,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
  },
  footerText: {
    color: '#475569',
    fontSize: 10,
  }
});
