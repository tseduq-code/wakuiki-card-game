/*
  # 最終フェーズに必要なフィールドを追加

  1. 新しいカラム
    - `players.has_shared_final_resonance` - 響き合いを共有したか (boolean)
    - `players.final_resonance_text` - 響き合いのテキスト (text)

  2. 目的
    - share_final_resonance関数で使用されるフィールドが不足していたため追加
    - これにより最終フェーズでのエラーを解決

  3. セキュリティ
    - RLSは既存のplayers テーブルのポリシーが適用される
*/

-- playersテーブルに響き合い関連のフィールドを追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'has_shared_final_resonance'
  ) THEN
    ALTER TABLE players 
    ADD COLUMN has_shared_final_resonance boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'final_resonance_text'
  ) THEN
    ALTER TABLE players 
    ADD COLUMN final_resonance_text text DEFAULT '';
  END IF;
END $$;
