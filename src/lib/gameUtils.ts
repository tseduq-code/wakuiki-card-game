import { getUniqueCardList } from '../data/cards';
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
 * 定義済みリストを Set で重複排除し、ぴったり36枚であることを保証してからシャッフルする。
 * ゲーム開始時（ルーム作成時）に1回だけ呼び、DBに保存する。カードは「移動」として扱い複製しない。
 */
export function shuffleDeck(): string[] {
  const unique = getUniqueCardList();
  if (unique.length !== EXPECTED_DECK_SIZE) {
    throw new Error(
      `[gameUtils] shuffleDeck: ${EXPECTED_DECK_SIZE} 枚である必要があります（重複排除後: ${unique.length} 枚）`
    );
  }

  const shuffled = [...unique];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  if (new Set(shuffled).size !== EXPECTED_DECK_SIZE) {
    throw new Error('[gameUtils] shuffleDeck: シャッフル後に重複が検出されました');
  }
  return shuffled;
}

/**
 * 初期手札と山札を配る。deck は 36 枚ユニークであることを前提とする（重複があればエラー）。
 * カードは「移動」として扱い、配った分は deck から取り除くだけ（複製しない）。
 */
export function dealInitialHands(deck: string[]): {
  hands: string[][],
  discardPile: string[],
  remainingDeck: string[]
} {
  if (deck.length !== EXPECTED_DECK_SIZE || new Set(deck).size !== EXPECTED_DECK_SIZE) {
    throw new Error(
      `[gameUtils] dealInitialHands: デッキは ${EXPECTED_DECK_SIZE} 枚・ユニークである必要があります（length: ${deck.length}, unique: ${new Set(deck).size}）`
    );
  }

  const hands: string[][] = [];
  for (let i = 0; i < 4; i++) {
    hands.push(deck.slice(i * 3, (i + 1) * 3));
  }

  const discardPile: string[] = [];
  const remainingDeck = deck.slice(12);

  const dealt = deck.slice(0, 12);
  const remainingSet = new Set(remainingDeck);
  if (dealt.some((c) => remainingSet.has(c))) {
    throw new Error('[gameUtils] dealInitialHands: 配布カードと山札に重複があります');
  }
  if (new Set(dealt).size !== 12 || remainingDeck.length !== 24) {
    throw new Error('[gameUtils] dealInitialHands: 配布後の枚数が不正です');
  }

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
