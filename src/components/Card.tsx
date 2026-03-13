import React from 'react';
import { Card as CardType } from '../types';

interface CardProps {
  card?: CardType;
  hidden?: boolean;
  className?: string;
}

const Card: React.FC<CardProps> = ({ card, hidden, className = '' }) => {
  if (hidden || !card) {
    return (
      <div className={`w-12 h-18 sm:w-16 sm:h-24 bg-blue-800 rounded-lg border-2 border-white flex items-center justify-center shadow-lg ${className}`}>
        <div className="w-8 h-12 sm:w-10 sm:h-16 border border-blue-400 rounded opacity-20 flex items-center justify-center">
          <div className="text-white font-bold text-xl">♠</div>
        </div>
      </div>
    );
  }

  const isRed = card.suit === 'h' || card.suit === 'd';
  const suitSymbols: Record<string, string> = {
    h: '♥',
    d: '♦',
    c: '♣',
    s: '♠',
  };

  return (
    <div className={`w-12 h-18 sm:w-16 sm:h-24 bg-white rounded-lg border border-gray-300 flex flex-col justify-between p-1 sm:p-2 shadow-lg ${className}`}>
      <div className={`text-xs sm:text-sm font-bold leading-none ${isRed ? 'text-red-600' : 'text-black'}`}>
        {card.rank === 'T' ? '10' : card.rank}
        <br />
        {suitSymbols[card.suit]}
      </div>
      <div className={`text-xl sm:text-3xl self-center ${isRed ? 'text-red-600' : 'text-black'}`}>
        {suitSymbols[card.suit]}
      </div>
      <div className={`text-xs sm:text-sm font-bold leading-none self-end rotate-180 ${isRed ? 'text-red-600' : 'text-black'}`}>
        {card.rank === 'T' ? '10' : card.rank}
        <br />
        {suitSymbols[card.suit]}
      </div>
    </div>
  );
};

export default Card;
