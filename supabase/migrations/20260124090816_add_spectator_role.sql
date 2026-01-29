/*
  # 観戦者機能の追加

  ## 概要
  プレイヤーに観戦者ロールを追加し、観戦者がゲームを見ることができるようにする

  ## 変更内容
  
  ### players テーブルの更新
  - `role` (text) - プレイヤーのロール ('player' または 'spectator')
    - デフォルトは 'player'
    - プレイヤーは4人まで、観戦者は無制限
  
  ## 注意事項
  - 観戦者はゲームプレイには参加しない
  - 観戦者は全てのゲーム状態を見ることができる
  - 観戦者はチェックイン、投票、カード交換などの操作はできない
*/

-- players テーブルに role カラムを追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'role'
  ) THEN
    ALTER TABLE players ADD COLUMN role text DEFAULT 'player' CHECK (role IN ('player', 'spectator'));
  END IF;
END $$;

-- 既存のプレイヤーはすべて 'player' として設定
UPDATE players SET role = 'player' WHERE role IS NULL;