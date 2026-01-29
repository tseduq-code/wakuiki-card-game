/*
  # カード交換フェーズの追跡機能追加

  ## 概要
  カード交換フェーズのターン管理とアクションログを追跡するための機能を追加

  ## 変更内容
  
  ### 1. game_rooms テーブルの更新
  - `current_exchange_turn` (integer) - 現在の交換ターンのプレイヤー番号（0-3）
    - デフォルトは 0
    - 交換フェーズでどのプレイヤーのターンかを管理
  
  ### 2. exchange_actions テーブルの作成
  新しいテーブルで交換アクションのログを記録
  - `id` (uuid, primary key) - アクションID
  - `room_id` (uuid, foreign key) - ルームID
  - `player_id` (uuid, foreign key) - プレイヤーID
  - `player_name` (text) - プレイヤー名（表示用）
  - `action_type` (text) - アクションタイプ ('exchange' または 'skip')
  - `hand_card` (text) - 手札から出したカード（交換時のみ）
  - `board_card` (text) - 場から取ったカード（交換時のみ）
  - `turn_number` (integer) - ターン番号
  - `created_at` (timestamptz) - 作成日時
  
  ## セキュリティ
  - exchange_actions テーブルでRLSを有効化
  - 認証なしでもプレイ可能（匿名アクセス許可）
  
  ## 注意事項
  - このテーブルは交換フェーズのログとリアルタイム同期に使用
  - 各ターンの交換を記録し、全プレイヤーが状況を把握できるようにする
*/

-- game_rooms テーブルに current_exchange_turn カラムを追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_rooms' AND column_name = 'current_exchange_turn'
  ) THEN
    ALTER TABLE game_rooms ADD COLUMN current_exchange_turn integer DEFAULT 0;
  END IF;
END $$;

-- exchange_actions テーブルを作成
CREATE TABLE IF NOT EXISTS exchange_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  player_name text NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('exchange', 'skip')),
  hand_card text,
  board_card text,
  turn_number integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE exchange_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read exchange actions"
  ON exchange_actions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can create exchange actions"
  ON exchange_actions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_exchange_actions_room_id ON exchange_actions(room_id);
CREATE INDEX IF NOT EXISTS idx_exchange_actions_created_at ON exchange_actions(created_at DESC);