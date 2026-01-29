/*
  # プレイヤーの準備完了フラグを追加

  ## 概要
  各フェーズで全員が準備完了になったことを確認するためのフラグを追加

  ## 変更内容
  
  ### players テーブルの更新
  - `ready_for_next_phase` (boolean) - 次のフェーズへの準備完了フラグ
    - デフォルトは false
    - 各フェーズで「次へ進む」ボタンを押すと true になる
    - フェーズが変わるとリセットされる
  
  ## 注意事項
  - このフラグは各フェーズの終わりで全員が準備完了かを確認するために使用
  - フェーズ遷移時には false にリセットする必要がある
*/

-- players テーブルに ready_for_next_phase カラムを追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'ready_for_next_phase'
  ) THEN
    ALTER TABLE players ADD COLUMN ready_for_next_phase boolean DEFAULT false;
  END IF;
END $$;

-- 既存のプレイヤーはすべて false として設定
UPDATE players SET ready_for_next_phase = false WHERE ready_for_next_phase IS NULL;