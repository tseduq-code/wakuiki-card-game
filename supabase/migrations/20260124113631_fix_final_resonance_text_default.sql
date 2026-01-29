/*
  # final_resonance_textにデフォルト値を設定

  1. 変更内容
    - `players.final_resonance_text`のデフォルト値を空文字列に設定
    - これにより、NULLエラーを防ぐ

  2. 目的
    - 最終フェーズでのエラーを解決
*/

-- final_resonance_textにデフォルト値を設定
DO $$
BEGIN
  ALTER TABLE players 
  ALTER COLUMN final_resonance_text SET DEFAULT '';
END $$;

-- 既存のNULL値を空文字列に更新
UPDATE players
SET final_resonance_text = ''
WHERE final_resonance_text IS NULL;
