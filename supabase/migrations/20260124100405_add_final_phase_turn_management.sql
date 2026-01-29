/*
  # 最終フェーズのターン管理フィールド追加

  1. 変更内容
    - game_roomsテーブルに`current_final_turn`フィールドを追加
    - 最終フェーズ（響き合いの共有 + ギフト交換）でどのプレイヤーのターンかを管理

  2. 変更されたテーブル
    - `game_rooms`
      - `current_final_turn` (integer, デフォルト: 0) - 最終フェーズの現在のターン (0-3)

  3. フェーズフロー
    - resonance_final フェーズで使用
    - プレイヤー0から順番に：
      1. 響き合いの共有を入力
      2. 手札3枚をギフトとして次のプレイヤーにプレゼント
      3. 次のプレイヤーのターンに移行
    - 全4人のプレイヤーが完了したら、gift_exchange フェーズへ（または completed へ）

  4. 注意事項
    - デフォルト値を0に設定（プレイヤー0から開始）
    - 既存のルームにも適用されるよう、NOT NULL制約を設定
*/

DO $$
BEGIN
  -- Add current_final_turn column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_rooms' AND column_name = 'current_final_turn'
  ) THEN
    ALTER TABLE game_rooms ADD COLUMN current_final_turn integer DEFAULT 0 NOT NULL;
  END IF;
END $$;
