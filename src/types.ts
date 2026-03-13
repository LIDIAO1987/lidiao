export type Suit = 'h' | 'd' | 'c' | 's';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type PlayerStatus = 'active' | 'folded' | 'all-in' | 'out';

export interface Player {
  id: number;
  name: string;
  chips: number;
  cards: Card[];
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  currentBet: number;
  status: PlayerStatus;
  isHuman: boolean;
  avatar: string;
}

export type GamePhase = 'waiting' | 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface GameState {
  players: Player[];
  communityCards: Card[];
  pot: number;
  currentTurn: number; // index of player
  dealerIndex: number;
  phase: GamePhase;
  deck: Card[];
  minRaise: number;
  lastRaise: number;
  highestBet: number;
}
