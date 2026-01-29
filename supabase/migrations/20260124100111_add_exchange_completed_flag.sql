/*
  # 交換フェーズ完了フラグの追加

  1. 変更内容
    - game_roomsテーブルに`exchange_completed`フィールドを追加
    - このフラグは交換フェーズが完了したかどうかを追跡するために使用

  2. 変更されたテーブル
    - `game_rooms`
      - `exchange_completed` (boolean, デフォルト: false) - 交換フェーズが完了したかどうか

  3. ゲームフロー
    - ラウンド1-2: playing（通常のプレイ）
    - ラウンド3開始時: exchange（交換フェーズ）
    - 交換完了後: exchange_completed = trueにして、playingに戻る
    - ラウンド3-4: playing（通常のプレイ）
    - ラウンド5開始時: resonance_final（最終響き合いの共有）

  4. 注意事項
    - デフォルト値をfalseに設定
    - 既存のルームにも適用されるよう、NOT NULL制約を設定
*/

DO $$
BEGIN
  -- Add exchange_completed column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_rooms' AND column_name = 'exchange_completed'
  ) THEN
    ALTER TABLE game_rooms ADD COLUMN exchange_completed boolean DEFAULT false NOT NULL;
  END IF;
END $$;
