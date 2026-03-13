/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
// @ts-ignore
import { Hand } from 'pokersolver';
import { Player, Card as CardType, GameState, GamePhase, PlayerStatus } from './types';
import { createDeck, cardToString } from './utils/pokerUtils';
import Card from './components/Card';
import { User, Cpu, Coins, Trophy, RefreshCcw, Info, Upload, Camera } from 'lucide-react';

const INITIAL_CHIPS = 100;
const SMALL_BLIND = 1;
const BIG_BLIND = 2;

const PLAYER_NAMES = ['You', 'Bot Alpha', 'Bot Beta', 'Bot Gamma', 'Bot Delta'];

// Random cartoon avatars for bots
const getBotAvatar = (name: string) => `https://api.dicebear.com/7.x/bottts/svg?seed=${name}`;
const DEFAULT_USER_AVATAR = `https://api.dicebear.com/7.x/avataaars/svg?seed=human`;

export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    players: PLAYER_NAMES.map((name, i) => ({
      id: i,
      name,
      chips: INITIAL_CHIPS,
      cards: [],
      isDealer: false,
      isSmallBlind: false,
      isBigBlind: false,
      currentBet: 0,
      status: 'active',
      isHuman: i === 0,
      avatar: i === 0 ? DEFAULT_USER_AVATAR : getBotAvatar(name),
    })),
    communityCards: [],
    pot: 0,
    currentTurn: -1,
    dealerIndex: 0,
    phase: 'waiting',
    deck: [],
    minRaise: BIG_BLIND,
    lastRaise: BIG_BLIND,
    highestBet: 0,
  });

  const [message, setMessage] = useState('Welcome to Texas Hold\'em!');
  const [showWinner, setShowWinner] = useState(false);
  const [winners, setWinners] = useState<{ player: Player; handName: string }[]>([]);
  const [timeLeft, setTimeLeft] = useState(10);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gameLoopRef = useRef<NodeJS.Timeout | null>(null);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setGameState(prev => ({
          ...prev,
          players: prev.players.map(p => p.isHuman ? { ...p, avatar: base64String } : p)
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Timer logic
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (gameState.currentTurn !== -1 && gameState.phase !== 'showdown' && gameState.phase !== 'waiting') {
      setTimeLeft(10);
      timer = setInterval(() => {
        setTimeLeft(prev => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [gameState.currentTurn, gameState.phase]);

  // Initialize game
  const startNewHand = useCallback(() => {
    setGameState(prev => {
      const deck = createDeck();
      const nextDealerIndex = (prev.dealerIndex + 1) % prev.players.length;
      
      // Reset players for new hand
      const players = prev.players.map((p, i) => ({
        ...p,
        cards: [],
        currentBet: 0,
        status: p.chips > 0 ? 'active' as PlayerStatus : 'out' as PlayerStatus,
        isDealer: i === nextDealerIndex,
        isSmallBlind: i === (nextDealerIndex + 1) % prev.players.length,
        isBigBlind: i === (nextDealerIndex + 2) % prev.players.length,
      }));

      // Check if game is over (only one player with chips)
      const activePlayersCount = players.filter(p => p.status !== 'out').length;
      if (activePlayersCount <= 1) {
        setMessage('Game Over! Restart to play again.');
        return prev;
      }

      // Deal cards
      let deckIndex = 0;
      players.forEach(p => {
        if (p.status !== 'out') {
          p.cards = [deck[deckIndex++], deck[deckIndex++]];
        }
      });

      // Post blinds
      const sbIndex = (nextDealerIndex + 1) % players.length;
      const bbIndex = (nextDealerIndex + 2) % players.length;
      
      const sbAmount = Math.min(players[sbIndex].chips, SMALL_BLIND);
      players[sbIndex].chips -= sbAmount;
      players[sbIndex].currentBet = sbAmount;

      const bbAmount = Math.min(players[bbIndex].chips, BIG_BLIND);
      players[bbIndex].chips -= bbAmount;
      players[bbIndex].currentBet = bbAmount;

      const pot = sbAmount + bbAmount;
      const firstTurn = (bbIndex + 1) % players.length;

      setMessage('New hand started. Pre-flop betting...');
      setShowWinner(false);

      return {
        ...prev,
        players,
        deck: deck.slice(deckIndex),
        communityCards: [],
        pot,
        dealerIndex: nextDealerIndex,
        currentTurn: firstTurn,
        phase: 'pre-flop',
        highestBet: BIG_BLIND,
        minRaise: BIG_BLIND,
        lastRaise: BIG_BLIND,
      };
    });
  }, []);

  const nextPhase = useCallback(() => {
    setGameState(prev => {
      const activePlayers = prev.players.filter(p => p.status === 'active' || p.status === 'all-in');
      
      // If only one player left, they win
      if (prev.players.filter(p => p.status === 'active' || p.status === 'all-in').length <= 1) {
        return { ...prev, phase: 'showdown' };
      }

      let newPhase: GamePhase = prev.phase;
      let newCommunityCards = [...prev.communityCards];
      let newDeck = [...prev.deck];

      if (prev.phase === 'pre-flop') {
        newPhase = 'flop';
        newCommunityCards = [newDeck[0], newDeck[1], newDeck[2]];
        newDeck = newDeck.slice(3);
      } else if (prev.phase === 'flop') {
        newPhase = 'turn';
        newCommunityCards = [...prev.communityCards, newDeck[0]];
        newDeck = newDeck.slice(1);
      } else if (prev.phase === 'turn') {
        newPhase = 'river';
        newCommunityCards = [...prev.communityCards, newDeck[0]];
        newDeck = newDeck.slice(1);
      } else if (prev.phase === 'river') {
        newPhase = 'showdown';
      }

      // Reset bets for new phase
      const players = prev.players.map(p => ({ ...p, currentBet: 0 }));
      
      // First active player after dealer starts
      let nextTurn = (prev.dealerIndex + 1) % prev.players.length;
      while (players[nextTurn].status !== 'active') {
        nextTurn = (nextTurn + 1) % players.length;
      }

      setMessage(`Phase: ${newPhase}`);

      return {
        ...prev,
        phase: newPhase,
        communityCards: newCommunityCards,
        deck: newDeck,
        players,
        highestBet: 0,
        currentTurn: nextTurn,
        minRaise: BIG_BLIND,
        lastRaise: BIG_BLIND,
      };
    });
  }, []);

  const handleShowdown = useCallback(() => {
    setGameState(prev => {
      const activePlayers = prev.players.filter(p => p.status !== 'folded' && p.status !== 'out');
      
      if (activePlayers.length === 0) return prev;

      const solvedHands = activePlayers.map(p => {
        const handCards = [...p.cards, ...prev.communityCards].map(cardToString);
        return {
          player: p,
          solved: Hand.solve(handCards),
        };
      });

      const winningHands = Hand.winners(solvedHands.map(h => h.solved));
      const winnersList = solvedHands.filter(h => winningHands.includes(h.solved));
      
      const winnerIds = winnersList.map(h => h.player.id);
      const share = Math.floor(prev.pot / winnerIds.length);
      
      const updatedPlayers = prev.players.map(p => {
        if (winnerIds.includes(p.id)) {
          return { ...p, chips: p.chips + share };
        }
        return p;
      });

      setWinners(winnersList.map(h => ({ player: h.player, handName: h.solved.descr })));
      setShowWinner(true);
      setMessage(`Winner: ${winnersList.map(h => h.player.name).join(', ')} with ${winnersList[0].solved.descr}`);
      
      if (winnersList.some(h => h.player.isHuman)) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
      }

      return {
        ...prev,
        players: updatedPlayers,
        pot: 0,
        phase: 'showdown',
        currentTurn: -1,
      };
    });
  }, []);

  const handleAction = useCallback((action: 'fold' | 'check' | 'call' | 'raise', amount: number = 0) => {
    setGameState(prev => {
      const player = prev.players[prev.currentTurn];
      const players = [...prev.players];
      let pot = prev.pot;
      let highestBet = prev.highestBet;
      let lastRaise = prev.lastRaise;
      let minRaise = prev.minRaise;

      if (action === 'fold') {
        players[prev.currentTurn].status = 'folded';
      } else if (action === 'check') {
        // Nothing to do
      } else if (action === 'call') {
        const callAmount = highestBet - player.currentBet;
        const actualCall = Math.min(player.chips, callAmount);
        players[prev.currentTurn].chips -= actualCall;
        players[prev.currentTurn].currentBet += actualCall;
        pot += actualCall;
        if (players[prev.currentTurn].chips === 0) {
          players[prev.currentTurn].status = 'all-in';
        }
      } else if (action === 'raise') {
        const totalBet = highestBet + amount;
        const raiseAmount = totalBet - player.currentBet;
        const actualRaise = Math.min(player.chips, raiseAmount);
        
        players[prev.currentTurn].chips -= actualRaise;
        players[prev.currentTurn].currentBet += actualRaise;
        pot += actualRaise;
        
        lastRaise = amount;
        highestBet = players[prev.currentTurn].currentBet;
        minRaise = highestBet + lastRaise;

        if (players[prev.currentTurn].chips === 0) {
          players[prev.currentTurn].status = 'all-in';
        }
      }

      // Check if round is over
      const activePlayers = players.filter(p => p.status === 'active');
      const allInPlayers = players.filter(p => p.status === 'all-in');
      
      // If only one active/all-in player left
      if (activePlayers.length + allInPlayers.length <= 1) {
        return { ...prev, players, pot, highestBet, lastRaise, minRaise, phase: 'showdown' };
      }

      // Find next player
      let nextTurn = (prev.currentTurn + 1) % players.length;
      let turnsChecked = 0;
      while (players[nextTurn].status !== 'active' && turnsChecked < players.length) {
        nextTurn = (nextTurn + 1) % players.length;
        turnsChecked++;
      }

      // Check if all active players have matched the highest bet
      const roundOver = activePlayers.every(p => p.currentBet === highestBet) && 
                        (action !== 'raise' || activePlayers.length === 1);

      if (roundOver) {
        return { ...prev, players, pot, highestBet, lastRaise, minRaise, currentTurn: -1 };
      }

      return { ...prev, players, pot, highestBet, lastRaise, minRaise, currentTurn: nextTurn };
    });
  }, []);

  // AI Logic
  useEffect(() => {
    if (gameState.phase !== 'waiting' && gameState.phase !== 'showdown' && gameState.currentTurn !== -1) {
      const currentPlayer = gameState.players[gameState.currentTurn];
      if (!currentPlayer.isHuman && currentPlayer.status === 'active') {
        const timer = setTimeout(() => {
          // Simple AI: 70% call/check, 10% fold, 20% raise
          const rand = Math.random();
          const canCheck = currentPlayer.currentBet === gameState.highestBet;
          
          if (rand < 0.1 && !canCheck) {
            handleAction('fold');
          } else if (rand < 0.8 || canCheck) {
            handleAction(canCheck ? 'check' : 'call');
          } else {
            const raiseAmount = Math.min(currentPlayer.chips, gameState.minRaise);
            handleAction('raise', raiseAmount);
          }
        }, 1000); // AI acts fast again
        return () => clearTimeout(timer);
      }
    }
  }, [gameState.currentTurn, gameState.phase, gameState.highestBet, gameState.minRaise, handleAction]);

  // Human Timeout Logic
  useEffect(() => {
    if (timeLeft === 0 && gameState.currentTurn === 0 && gameState.phase !== 'showdown' && gameState.phase !== 'waiting') {
      const canCheck = gameState.players[0].currentBet === gameState.highestBet;
      handleAction(canCheck ? 'check' : 'fold');
      setMessage(canCheck ? 'Time out! Auto-checked.' : 'Time out! Auto-folded.');
    }
  }, [timeLeft, gameState.currentTurn, gameState.phase, gameState.highestBet, handleAction]);

  // Phase transition logic
  useEffect(() => {
    if (gameState.currentTurn === -1 && gameState.phase !== 'waiting' && gameState.phase !== 'showdown') {
      const timer = setTimeout(() => {
        if (gameState.phase === 'river') {
          handleShowdown();
        } else {
          nextPhase();
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [gameState.currentTurn, gameState.phase, nextPhase, handleShowdown]);

  const resetGame = () => {
    setGameState(prev => ({
      players: PLAYER_NAMES.map((name, i) => ({
        id: i,
        name,
        chips: INITIAL_CHIPS,
        cards: [],
        isDealer: false,
        isSmallBlind: false,
        isBigBlind: false,
        currentBet: 0,
        status: 'active',
        isHuman: i === 0,
        avatar: i === 0 ? prev.players[0].avatar : getBotAvatar(name),
      })),
      communityCards: [],
      pot: 0,
      currentTurn: -1,
      dealerIndex: 0,
      phase: 'waiting',
      deck: [],
      minRaise: BIG_BLIND,
      lastRaise: BIG_BLIND,
      highestBet: 0,
    }));
    setMessage('Game reset. Click Start to play.');
    setShowWinner(false);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans overflow-hidden flex flex-col">
      {/* Header */}
      <header className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleAvatarUpload} 
          accept="image/*" 
          className="hidden" 
        />
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-900/20">
            <Trophy className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Texas Hold'em</h1>
            <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Classic 5-Player</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700">
            <Coins className="w-4 h-4 text-yellow-500" />
            <span className="text-sm font-bold">Pot: {gameState.pot}</span>
          </div>
          <button 
            onClick={resetGame}
            className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
            title="Reset Game"
          >
            <RefreshCcw className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Game Area */}
      <main className="flex-1 relative flex flex-col items-center justify-center p-4">
        {/* The Poker Table */}
        <div className="relative w-full max-w-4xl aspect-[16/9] bg-emerald-800 rounded-[200px] border-[12px] border-slate-700 shadow-2xl flex items-center justify-center overflow-hidden">
          {/* Table Felt Pattern */}
          <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
          
          {/* Community Cards */}
          <div className="flex gap-2 z-10">
            <AnimatePresence>
              {gameState.communityCards.map((card, i) => (
                <motion.div
                  key={`comm-${i}`}
                  initial={{ scale: 0, opacity: 0, y: -50 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  transition={{ type: 'spring', damping: 12, stiffness: 100, delay: i * 0.1 }}
                >
                  <Card card={card} />
                </motion.div>
              ))}
              {Array.from({ length: 5 - gameState.communityCards.length }).map((_, i) => (
                <div key={`empty-${i}`} className="w-12 h-18 sm:w-16 sm:h-24 border-2 border-emerald-900/50 rounded-lg bg-emerald-900/20"></div>
              ))}
            </AnimatePresence>
          </div>

          {/* Pot Display */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 flex flex-col items-center">
            <div className="bg-black/40 backdrop-blur-sm px-4 py-1 rounded-full border border-white/10 flex items-center gap-2">
              <Coins className="w-4 h-4 text-yellow-500" />
              <span className="text-lg font-bold text-yellow-400">{gameState.pot}</span>
            </div>
            <p className="text-[10px] uppercase tracking-widest text-emerald-300 mt-1 font-bold">Total Pot</p>
          </div>

          {/* Players Around the Table */}
          {gameState.players.map((player, i) => {
            // Position players around the oval table
            const positions = [
              "bottom-4 left-1/2 -translate-x-1/2", // You (0)
              "left-4 top-1/2 -translate-y-1/2",    // Bot 1 (1)
              "top-4 left-1/4 -translate-x-1/2",    // Bot 2 (2)
              "top-4 right-1/4 translate-x-1/2",   // Bot 3 (3)
              "right-4 top-1/2 -translate-y-1/2",   // Bot 4 (4)
            ];

            const isActive = gameState.currentTurn === i;
            const isWinner = winners.some(w => w.player.id === i);

            return (
              <div key={player.id} className={`absolute ${positions[i]} z-20 transition-all duration-300 ${isActive ? 'scale-110' : 'scale-100'}`}>
                <div className={`flex flex-col items-center gap-2`}>
                  {/* Player Info Card */}
                  <div className={`relative bg-slate-900/90 backdrop-blur-md p-2 rounded-xl border-2 transition-all ${isActive ? 'border-emerald-500 shadow-lg shadow-emerald-500/20' : isWinner ? 'border-yellow-500 shadow-lg shadow-yellow-500/20' : 'border-slate-700'} w-28 sm:w-36`}>
                    {/* Timer Progress Bar (Only for Human) */}
                    {isActive && player.isHuman && (
                      <div className="absolute -bottom-1 left-0 w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: '100%' }}
                          animate={{ width: `${(timeLeft / 10) * 100}%` }}
                          transition={{ duration: 1, ease: 'linear' }}
                          className="h-full bg-emerald-500"
                        />
                      </div>
                    )}
                    
                    {/* Status Badge */}
                    {player.status !== 'active' && player.status !== 'out' && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                        {player.status}
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`relative w-10 h-10 rounded-full flex items-center justify-center overflow-hidden border-2 ${player.isHuman ? 'border-indigo-500' : 'border-slate-700'} bg-slate-800`}>
                        <img 
                          src={player.avatar} 
                          alt={player.name} 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        {player.isHuman && (
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity"
                          >
                            <Camera className="w-4 h-4 text-white" />
                          </button>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate">{player.name}</p>
                        <p className="text-[10px] text-yellow-500 font-bold flex items-center gap-1">
                          <Coins className="w-2 h-2" /> {player.chips}
                        </p>
                      </div>
                    </div>

                    {/* Current Bet */}
                    {player.currentBet > 0 && (
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-yellow-600/20 border border-yellow-600/50 px-2 py-0.5 rounded-full">
                        <Coins className="w-3 h-3 text-yellow-500" />
                        <span className="text-xs font-bold text-yellow-500">{player.currentBet}</span>
                      </div>
                    )}

                    {/* Dealer/Blind Buttons */}
                    <div className="absolute -right-2 -top-2 flex gap-1">
                      {player.isDealer && <div className="w-5 h-5 bg-white text-black rounded-full flex items-center justify-center text-[10px] font-bold border border-slate-400 shadow-sm">D</div>}
                      {player.isSmallBlind && <div className="w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold border border-blue-400 shadow-sm">SB</div>}
                      {player.isBigBlind && <div className="w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold border border-red-400 shadow-sm">BB</div>}
                    </div>
                  </div>

                  {/* Cards */}
                  <div className="flex -space-x-4 sm:-space-x-6">
                    {player.cards.map((card, ci) => (
                      <motion.div
                        key={`${player.id}-card-${ci}`}
                        initial={{ y: 20, opacity: 0, rotate: -10 }}
                        animate={{ y: 0, opacity: 1, rotate: ci === 0 ? -5 : 5 }}
                        transition={{ delay: ci * 0.1 }}
                      >
                        <Card 
                          card={card} 
                          hidden={!player.isHuman && gameState.phase !== 'showdown'} 
                          className="scale-75 sm:scale-90"
                        />
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Game Message Overlay */}
        <div className="mt-8 text-center">
          <p className="text-lg font-medium text-slate-300 bg-slate-800/50 px-6 py-2 rounded-full border border-slate-700 inline-block">
            {message}
          </p>
        </div>

        {/* Winner Overlay */}
        <AnimatePresence>
          {showWinner && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
            >
              <div className="bg-slate-900 border-2 border-yellow-500 p-8 rounded-3xl shadow-2xl max-w-md w-full text-center">
                <Trophy className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
                <h2 className="text-3xl font-black mb-2 text-yellow-500 uppercase italic">Winner!</h2>
                <div className="space-y-4 mb-8">
                  {winners.map((w, i) => (
                    <div key={i} className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                      <p className="text-xl font-bold">{w.player.name}</p>
                      <p className="text-emerald-400 font-medium">{w.handName}</p>
                    </div>
                  ))}
                </div>
                <button 
                  onClick={startNewHand}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2"
                >
                  <RefreshCcw className="w-5 h-5" /> Next Hand
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Controls Footer */}
      <footer className="p-6 bg-slate-900 border-t border-slate-800">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Player Stats */}
          <div className="flex items-center gap-4">
            <div className="bg-slate-800 p-3 rounded-2xl border border-slate-700 flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
                <User className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Your Chips</p>
                <p className="text-xl font-black text-yellow-500">{gameState.players[0].chips}</p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap justify-center gap-3">
            {gameState.phase === 'waiting' ? (
              <button 
                onClick={startNewHand}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-12 py-4 rounded-2xl transition-all shadow-lg shadow-emerald-900/40 uppercase tracking-widest"
              >
                Start Game
              </button>
            ) : (
              <>
                <button 
                  disabled={gameState.currentTurn !== 0 || gameState.phase === 'showdown'}
                  onClick={() => handleAction('fold')}
                  className="bg-red-600 hover:bg-red-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold px-6 py-3 rounded-xl transition-all uppercase text-sm"
                >
                  Fold
                </button>
                <button 
                  disabled={gameState.currentTurn !== 0 || gameState.phase === 'showdown' || gameState.players[0].currentBet < gameState.highestBet}
                  onClick={() => handleAction('check')}
                  className="bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold px-6 py-3 rounded-xl transition-all uppercase text-sm"
                >
                  Check
                </button>
                <button 
                  disabled={gameState.currentTurn !== 0 || gameState.phase === 'showdown' || gameState.players[0].currentBet === gameState.highestBet}
                  onClick={() => handleAction('call')}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold px-6 py-3 rounded-xl transition-all uppercase text-sm"
                >
                  Call {gameState.highestBet - gameState.players[0].currentBet > 0 ? `(${gameState.highestBet - gameState.players[0].currentBet})` : ''}
                </button>
                <button 
                  disabled={gameState.currentTurn !== 0 || gameState.phase === 'showdown' || gameState.players[0].chips < gameState.minRaise}
                  onClick={() => handleAction('raise', gameState.minRaise)}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold px-6 py-3 rounded-xl transition-all uppercase text-sm"
                >
                  Raise {gameState.minRaise}
                </button>
              </>
            )}
          </div>

          {/* Game Info */}
          <div className="hidden md:flex items-center gap-2 text-slate-500">
            <Info className="w-4 h-4" />
            <span className="text-xs font-medium">Blinds: {SMALL_BLIND}/{BIG_BLIND}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
