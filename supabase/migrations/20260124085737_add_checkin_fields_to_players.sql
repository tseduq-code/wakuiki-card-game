/*
  # チェックイン情報をプレイヤーテーブルに追加

  ## 変更内容
  
  ### 1. players テーブル
  チェックイン時に入力する情報を保存するカラムを追加
    - `preferred_name` (text) - ボードゲーム中に呼ばれたい名前
    - `current_feeling` (text) - 今の気持ち
    - `has_checked_in` (boolean) - チェックイン完了フラグ
  
  ## 注意事項
  - 既存のデータには影響なし
  - RLSポリシーは既存のものを継承
*/

-- プレイヤーテーブルにチェックイン情報を追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'preferred_name'
  ) THEN
    ALTER TABLE players ADD COLUMN preferred_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'current_feeling'
  ) THEN
    ALTER TABLE players ADD COLUMN current_feeling text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'has_checked_in'
  ) THEN
    ALTER TABLE players ADD COLUMN has_checked_in boolean DEFAULT false;
  END IF;
END $$;