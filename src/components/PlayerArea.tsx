import { Player, CardInstance } from '../lib/supabase';
import { Card } from './Card';
import { useMemo } from 'react';
import { deduplicateCards } from '../lib/gameUtils';

interface PlayerAreaProps {
  player: Player;
  position: 'top' | 'bottom' | 'left' | 'right';
  isCurrentTurn: boolean;
  onCardClick?: (cardIndex: number) => void;
  selectedCardIndex?: number;
  lastDrawnCardInstance?: CardInstance | null;
  guidanceText?: string;
}

// Generate stable instanceId for cards based on player ID, card name, and position
function generateCardInstanceId(playerId: string, cardName: string, index: number): string {
  return `${playerId}-${cardName}-${index}`;
}

export function PlayerArea({ player, position, isCurrentTurn, onCardClick, selectedCardIndex, lastDrawnCardInstance, guidanceText }: PlayerAreaProps) {
  const isVertical = position === 'left' || position === 'right';
  const displayName = player.preferred_name || player.name;

  // Convert hand strings to CardInstance objects with stable instanceIds
  const cardInstances = useMemo(() => {
    if (!player.hand?.length) return [];
    
    // Track seen card names to detect duplicates
    const seenNames = new Map<string, number>();
    
    const instances = player.hand.map((cardName, index) => {
      const occurrence = seenNames.get(cardName) || 0;
      seenNames.set(cardName, occurrence + 1);
      
      const instanceId = occurrence === 0 
        ? generateCardInstanceId(player.id, cardName, index)
        : `${player.id}-${cardName}-${index}-dup${occurrence}`;
      
      return {
        name: cardName,
        instanceId
      } as CardInstance;
    });

    // UI層の防御: instanceId（なければ name）に基づく重複排除
    return deduplicateCards(instances);
  }, [player.id, player.hand]);

  return (
    <div className="w-full max-w-xs mx-auto">
      <div
        className={`bg-white/90 backdrop-blur rounded-xl shadow-xl p-4 border-2 transition ${
          isCurrentTurn
            ? 'border-blue-500 ring-2 ring-blue-200 shadow-2xl'
            : 'border-gray-200'
        }`}
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            className={`w-3 h-3 rounded-full ${
              player.is_connected ? 'bg-green-500' : 'bg-gray-400'
            }`}
          />
          <h3 className="font-bold text-lg text-gray-800 truncate">{displayName}</h3>
          {isCurrentTurn && (
            <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">
              ターン中
            </span>
          )}
        </div>
        <div
          className={`flex ${
            isVertical ? 'flex-col' : 'flex-row'
          } gap-2 justify-center`}
        >
          {cardInstances.length ? (
            cardInstances.map((cardInstance, index) => (
              <Card
                key={cardInstance.instanceId}
                text={cardInstance.name}
                variant="small"
                onClick={() => onCardClick?.(index)}
                selected={selectedCardIndex === index}
                isNewlyDrawn={lastDrawnCardInstance?.instanceId === cardInstance.instanceId}
              />
            ))
          ) : (
            <p className="text-xs text-gray-500 text-center">カードを準備中...</p>
          )}
        </div>
        {guidanceText && (
          <p className="mt-3 text-sm text-gray-700 text-center bg-blue-50/80 rounded-lg px-3 py-2 border border-blue-100">
            {guidanceText}
          </p>
        )}
      </div>
    </div>
  );
}
