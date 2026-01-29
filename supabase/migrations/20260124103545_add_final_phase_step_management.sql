/*
  # 最終フェーズのステップ管理機能を追加

  1. 新しいフロー
    - 1ターン = 響き合い共有 → ギフトプレゼント → 感想共有
    - 各プレイヤーが順番にこのフローを実行
    
  2. 追加するカラム
    - `game_rooms.final_phase_step` - 現在のステップ ('sharing', 'gifting', 'reflection')
    - `players.final_gifts_received` - 受け取ったギフトの配列 [{from_player_id, from_player_name, card_text}]
    - `players.final_reflection_text` - 響き合い共有後の感想
    - `players.has_given_final_gift` - 現在のターンでギフトを贈ったか

  3. フロー説明
    - sharing: final_phase_turnのプレイヤーが響き合いを共有
    - gifting: 他の3人のプレイヤーがギフトカードを贈る
    - reflection: final_phase_turnのプレイヤーが感想を述べる
    - 次のターンへ進む
*/

-- game_roomsテーブルに最終フェーズのステップを追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_rooms' AND column_name = 'final_phase_step'
  ) THEN
    ALTER TABLE game_rooms 
    ADD COLUMN final_phase_step text DEFAULT 'sharing' 
    CHECK (final_phase_step IN ('sharing', 'gifting', 'reflection'));
  END IF;
END $$;

-- playersテーブルにギフトと感想のカラムを追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'final_gifts_received'
  ) THEN
    ALTER TABLE players 
    ADD COLUMN final_gifts_received jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'final_reflection_text'
  ) THEN
    ALTER TABLE players 
    ADD COLUMN final_reflection_text text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'has_given_final_gift'
  ) THEN
    ALTER TABLE players 
    ADD COLUMN has_given_final_gift boolean DEFAULT false;
  END IF;
END $$;

-- 響き合いを共有する関数
CREATE OR REPLACE FUNCTION share_final_resonance(
  p_room_id uuid,
  p_player_id uuid,
  p_resonance_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room game_rooms;
  v_player players;
BEGIN
  -- ゲームルームをロック
  SELECT * INTO v_room
  FROM game_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'ルームが見つかりません');
  END IF;

  -- 現在のステップがsharingか確認
  IF v_room.final_phase_step != 'sharing' THEN
    RETURN jsonb_build_object('success', false, 'message', '現在は響き合いの共有フェーズではありません');
  END IF;

  -- プレイヤー情報を取得
  SELECT * INTO v_player
  FROM players
  WHERE id = p_player_id AND room_id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'プレイヤーが見つかりません');
  END IF;

  -- 現在のターンプレイヤーか確認
  IF v_player.player_position != v_room.final_phase_turn THEN
    RETURN jsonb_build_object('success', false, 'message', 'あなたのターンではありません');
  END IF;

  -- 既に共有済みか確認
  IF v_player.has_shared_final_resonance THEN
    RETURN jsonb_build_object('success', false, 'message', '既に響き合いを共有しています');
  END IF;

  -- 響き合いを記録
  UPDATE players
  SET 
    final_resonance_text = p_resonance_text,
    has_shared_final_resonance = true
  WHERE id = p_player_id;

  -- ステップをgiftingに変更
  UPDATE game_rooms
  SET final_phase_step = 'gifting', updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', '響き合いを共有しました'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'エラーが発生しました: ' || SQLERRM
    );
END;
$$;

-- ギフトを贈る関数
CREATE OR REPLACE FUNCTION give_final_gift(
  p_room_id uuid,
  p_from_player_id uuid,
  p_to_player_id uuid,
  p_card_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room game_rooms;
  v_from_player players;
  v_to_player players;
  v_card_found boolean;
  v_new_hand jsonb;
  v_new_gifts jsonb;
  v_gift_count int;
  v_all_gifted boolean;
BEGIN
  -- ゲームルームをロック
  SELECT * INTO v_room
  FROM game_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'ルームが見つかりません');
  END IF;

  -- 現在のステップがgiftingか確認
  IF v_room.final_phase_step != 'gifting' THEN
    RETURN jsonb_build_object('success', false, 'message', '現在はギフトフェーズではありません');
  END IF;

  -- 贈る側のプレイヤー情報を取得
  SELECT * INTO v_from_player
  FROM players
  WHERE id = p_from_player_id AND room_id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'プレイヤーが見つかりません');
  END IF;

  -- 受け取る側のプレイヤー情報を取得
  SELECT * INTO v_to_player
  FROM players
  WHERE id = p_to_player_id AND room_id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', '贈り先のプレイヤーが見つかりません');
  END IF;

  -- 現在のターンプレイヤーに贈ろうとしているか確認
  IF v_to_player.player_position != v_room.final_phase_turn THEN
    RETURN jsonb_build_object('success', false, 'message', '現在のターンプレイヤーにのみギフトを贈れます');
  END IF;

  -- 自分自身に贈ろうとしていないか確認
  IF p_from_player_id = p_to_player_id THEN
    RETURN jsonb_build_object('success', false, 'message', '自分自身にギフトを贈ることはできません');
  END IF;

  -- 既にギフトを贈ったか確認
  IF v_from_player.has_given_final_gift THEN
    RETURN jsonb_build_object('success', false, 'message', '既にギフトを贈っています');
  END IF;

  -- 手札に指定されたカードが存在するかチェック
  SELECT EXISTS(
    SELECT 1
    FROM jsonb_array_elements_text(v_from_player.hand) AS card
    WHERE card = p_card_text
  ) INTO v_card_found;

  IF NOT v_card_found THEN
    RETURN jsonb_build_object('success', false, 'message', '指定されたカードが手札にありません');
  END IF;

  -- 手札からカードを削除
  WITH hand_with_index AS (
    SELECT value, idx
    FROM jsonb_array_elements_text(v_from_player.hand) WITH ORDINALITY AS t(value, idx)
  ),
  card_to_remove AS (
    SELECT idx
    FROM hand_with_index
    WHERE value = p_card_text
    LIMIT 1
  )
  SELECT COALESCE(jsonb_agg(value ORDER BY idx), '[]'::jsonb)
  INTO v_new_hand
  FROM hand_with_index
  WHERE idx NOT IN (SELECT idx FROM card_to_remove);

  -- ギフト情報を作成
  v_new_gifts := v_to_player.final_gifts_received || jsonb_build_array(
    jsonb_build_object(
      'from_player_id', p_from_player_id,
      'from_player_name', v_from_player.player_name,
      'card_text', p_card_text
    )
  );

  -- 贈る側の手札を更新
  UPDATE players
  SET 
    hand = v_new_hand,
    has_given_final_gift = true
  WHERE id = p_from_player_id;

  -- 受け取る側のギフトを更新
  UPDATE players
  SET final_gifts_received = v_new_gifts
  WHERE id = p_to_player_id;

  -- 全員がギフトを贈ったか確認（現在のターンプレイヤー以外の3人）
  SELECT COUNT(*) INTO v_gift_count
  FROM players
  WHERE room_id = p_room_id 
    AND role = 'player'
    AND player_position != v_room.final_phase_turn
    AND has_given_final_gift = true;

  v_all_gifted := (v_gift_count >= 3);

  -- 全員がギフトを贈った場合、reflectionステップに進む
  IF v_all_gifted THEN
    UPDATE game_rooms
    SET final_phase_step = 'reflection', updated_at = now()
    WHERE id = p_room_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'ギフトを贈りました',
    'all_gifted', v_all_gifted
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'エラーが発生しました: ' || SQLERRM
    );
END;
$$;

-- 感想を共有する関数
CREATE OR REPLACE FUNCTION share_final_reflection(
  p_room_id uuid,
  p_player_id uuid,
  p_reflection_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room game_rooms;
  v_player players;
  v_next_turn int;
  v_new_status text;
BEGIN
  -- ゲームルームをロック
  SELECT * INTO v_room
  FROM game_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'ルームが見つかりません');
  END IF;

  -- 現在のステップがreflectionか確認
  IF v_room.final_phase_step != 'reflection' THEN
    RETURN jsonb_build_object('success', false, 'message', '現在は感想共有フェーズではありません');
  END IF;

  -- プレイヤー情報を取得
  SELECT * INTO v_player
  FROM players
  WHERE id = p_player_id AND room_id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'プレイヤーが見つかりません');
  END IF;

  -- 現在のターンプレイヤーか確認
  IF v_player.player_position != v_room.final_phase_turn THEN
    RETURN jsonb_build_object('success', false, 'message', 'あなたのターンではありません');
  END IF;

  -- 感想を記録
  UPDATE players
  SET final_reflection_text = p_reflection_text
  WHERE id = p_player_id;

  -- 次のターンを計算
  v_next_turn := v_room.final_phase_turn + 1;

  -- 全員が完了したかチェック
  IF v_next_turn >= 4 THEN
    v_new_status := 'complete';
    v_next_turn := 0;
    
    UPDATE game_rooms
    SET 
      status = v_new_status,
      final_phase_turn = v_next_turn,
      final_phase_step = 'sharing',
      updated_at = now()
    WHERE id = p_room_id;
  ELSE
    -- 次のターンに進み、has_given_final_giftをリセット
    UPDATE game_rooms
    SET 
      final_phase_turn = v_next_turn,
      final_phase_step = 'sharing',
      updated_at = now()
    WHERE id = p_room_id;

    UPDATE players
    SET has_given_final_gift = false
    WHERE room_id = p_room_id AND role = 'player';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', '感想を共有しました',
    'next_turn', v_next_turn,
    'is_complete', v_next_turn = 0
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'エラーが発生しました: ' || SQLERRM
    );
END;
$$;

-- 関数の実行権限を設定
GRANT EXECUTE ON FUNCTION share_final_resonance TO authenticated;
GRANT EXECUTE ON FUNCTION share_final_resonance TO anon;
GRANT EXECUTE ON FUNCTION give_final_gift TO authenticated;
GRANT EXECUTE ON FUNCTION give_final_gift TO anon;
GRANT EXECUTE ON FUNCTION share_final_reflection TO authenticated;
GRANT EXECUTE ON FUNCTION share_final_reflection TO anon;
