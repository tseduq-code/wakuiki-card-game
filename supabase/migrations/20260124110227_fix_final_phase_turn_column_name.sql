/*
  # final_phase_turnカラム名を修正

  1. 問題
    - game_roomsテーブルに`current_final_turn`という名前でカラムが作成されているが
    - 関数では`final_phase_turn`という名前で参照している
    - これにより「record "v_room" has no field "final_phase_turn"」エラーが発生

  2. 解決策
    - カラム名を`current_final_turn`から`final_phase_turn`にリネーム
*/

DO $$
BEGIN
  -- current_final_turnが存在し、final_phase_turnが存在しない場合のみリネーム
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_rooms' AND column_name = 'current_final_turn'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_rooms' AND column_name = 'final_phase_turn'
  ) THEN
    ALTER TABLE game_rooms 
    RENAME COLUMN current_final_turn TO final_phase_turn;
  END IF;
END $$;
