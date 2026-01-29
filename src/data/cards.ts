export const purposeCards = [
  "朝、気持ちよく目覚ますとしたら",
  "ベストな状態で食事をするとしたら",
  "満足した気持ちで寝るとしたら",
  "今日一日やりきったと思うためには",
  "新しいことをやろうと思うためには",
  "1日笑顔で過ごすとしたら",
  "自分自身が笑顔でいるためには",
  "好きな人に感謝の気持ちを伝えるとしたら",
  "機嫌が良くなるためには",
  "自分が心地よい気持ちでいるためには"
];

/** ゲームで使う36種類の価値観カード（すべてユニーク、重複なし） */
export const CARD_LIST = [
  "チャレンジ",
  "思い切り",
  "冒険",
  "情熱",
  "成長",
  "勤勉",
  "責任",
  "達成",
  "セルフコントロール",
  "徳",
  "感謝",
  "奉仕",
  "誠実さ",
  "人気",
  "愛",
  "余暇",
  "自分を受け入れること",
  "協力",
  "貢献",
  "頼りになること",
  "心のやすらぎ",
  "寛大さ",
  "正直",
  "受け入れられること",
  "自尊心",
  "自律",
  "一人の時間",
  "根性",
  "気前のよさ",
  "心の広さ",
  "変化",
  "希望",
  "やわらかな心",
  "柔軟性",
  "単純さ",
  "面白さ"
] as const;

const EXPECTED_DECK_SIZE = 36;

/** 36枚・すべてユニークであることを保証。違う場合は起動時にエラーにする */
function assert36UniqueDeck(cards: readonly string[]): void {
  if (cards.length !== EXPECTED_DECK_SIZE) {
    throw new Error(
      `[cards] CARD_LIST は ${EXPECTED_DECK_SIZE} 枚である必要があります（現在 ${cards.length} 枚）`
    );
  }
  const seen = new Set<string>();
  for (const name of cards) {
    if (seen.has(name)) {
      throw new Error(`[cards] 重複カード名: ${name}`);
    }
    seen.add(name);
  }
}

assert36UniqueDeck(CARD_LIST);

/** 36種類のユニークなカード名のみを返す（重複排除・枚数保証）。デッキ生成時に使用 */
export function getUniqueCardList(): string[] {
  const unique = [...new Set(CARD_LIST)];
  if (unique.length !== EXPECTED_DECK_SIZE) {
    throw new Error(
      `[cards] getUniqueCardList: ${EXPECTED_DECK_SIZE} 枚である必要があります（重複排除後: ${unique.length} 枚）`
    );
  }
  return unique;
}

/** @deprecated CARD_LIST を使用してください */
export const valueCards = [...CARD_LIST];
