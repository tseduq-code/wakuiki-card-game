import { CARD_LIST } from '../data/cards';
import type { CardInstance } from './supabase';

const EXPECTED_DECK_SIZE = 36;

/** 手札文字列配列から重複を除去（同じ名前のカードは最初の1件のみ、Realtime競合対策） */
export function deduplicateHandStrings(hand: string[]): string[] {
  const seen = new Set<string>();
  return hand.filter((name) => {
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

/** instanceId（なければ name）に基づいてカード配列の重複を完全に除去 */
export function deduplicateCards(cards: CardInstance[]): CardInstance[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const uniqueKey = card.instanceId ?? card.name;
    if (seen.has(uniqueKey)) return false;
    seen.add(uniqueKey);
    return true;
  });
}

/**
 * 36枚のユニークなカードをシャッフルして初期デッキを作成する。
 * ゲーム開始時（ルーム作成時）に1回だけ呼び、DBに保存する。
 */
export function shuffleDeck(): string[] {
  const shuffled = [...CARD_LIST];
  if (shuffled.length !== EXPECTED_DECK_SIZE) {
    console.warn(`[gameUtils] デッキ枚数が ${EXPECTED_DECK_SIZE} ではありません: ${shuffled.length}`);
  }
  const seen = new Set<string>();
  for (const name of shuffled) {
    if (seen.has(name)) {
      console.warn(`[gameUtils] 重複カード名: ${name}`);
    }
    seen.add(name);
  }

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  if (shuffled.length !== EXPECTED_DECK_SIZE || new Set(shuffled).size !== EXPECTED_DECK_SIZE) {
    console.error('[gameUtils] shuffleDeck: 36枚ユニークでありません', {
      length: shuffled.length,
      unique: new Set(shuffled).size
    });
  }
  return shuffled;
}

export function dealInitialHands(deck: string[]): {
  hands: string[][],
  discardPile: string[],
  remainingDeck: string[]
} {
  const hands: string[][] = [];

  // Deal 3 cards to each of 4 players (12 cards total)
  for (let i = 0; i < 4; i++) {
    hands.push(deck.slice(i * 3, (i + 1) * 3));
  }

  // Board starts empty - no discard pile initially
  const discardPile: string[] = [];

  // Remaining 24 cards stay in the deck (36 total - 12 dealt = 24 remaining)
  const remainingDeck = deck.slice(12);

  return {
    hands,
    discardPile,
    remainingDeck
  };
}

export function getPlayerPosition(playerNumber: number): string {
  const positions = ['bottom', 'left', 'top', 'right'];
  return positions[playerNumber];
}
