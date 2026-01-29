/*
  # player_positionをplayer_numberに修正

  1. 問題
    - 関数内でplayer_positionを参照しているが、実際のカラム名はplayer_number
    
  2. 修正内容
    - すべての関数内のplayer_position参照をplayer_numberに変更
*/

-- share_final_resonance関数を修正
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
  SELECT * INTO v_room
  FROM game_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'ルームが見つかりません');
  END IF;

  IF v_room.final_phase_step != 'sharing' THEN
    RETURN jsonb_build_object('success', false, 'message', '現在は響き合いの共有フェーズではありません');
  END IF;

  SELECT * INTO v_player
  FROM players
  WHERE id = p_player_id AND room_id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'プレイヤーが見つかりません');
  END IF;

  IF v_player.player_number != v_room.final_phase_turn THEN
    RETURN jsonb_build_object('success', false, 'message', 'あなたのターンではありません');
  END IF;

  IF v_player.has_shared_final_resonance THEN
    RETURN jsonb_build_object('success', false, 'message', '既に響き合いを共有しています');
  END IF;

  UPDATE players
  SET 
    final_resonance_text = p_resonance_text,
    has_shared_final_resonance = true
  WHERE id = p_player_id;

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

-- give_final_gift関数を修正
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
  SELECT * INTO v_room
  FROM game_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'ルームが見つかりません');
  END IF;

  IF v_room.final_phase_step != 'gifting' THEN
    RETURN jsonb_build_object('success', false, 'message', '現在はギフトフェーズではありません');
  END IF;

  SELECT * INTO v_from_player
  FROM players
  WHERE id = p_from_player_id AND room_id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'プレイヤーが見つかりません');
  END IF;

  SELECT * INTO v_to_player
  FROM players
  WHERE id = p_to_player_id AND room_id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', '贈り先のプレイヤーが見つかりません');
  END IF;

  IF v_to_player.player_number != v_room.final_phase_turn THEN
    RETURN jsonb_build_object('success', false, 'message', '現在のターンプレイヤーにのみギフトを贈れます');
  END IF;

  IF p_from_player_id = p_to_player_id THEN
    RETURN jsonb_build_object('success', false, 'message', '自分自身にギフトを贈ることはできません');
  END IF;

  IF v_from_player.has_given_final_gift THEN
    RETURN jsonb_build_object('success', false, 'message', '既にギフトを贈っています');
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM jsonb_array_elements_text(v_from_player.hand) AS card
    WHERE card = p_card_text
  ) INTO v_card_found;

  IF NOT v_card_found THEN
    RETURN jsonb_build_object('success', false, 'message', '指定されたカードが手札にありません');
  END IF;

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

  v_new_gifts := v_to_player.final_gifts_received || jsonb_build_array(
    jsonb_build_object(
      'from_player_id', p_from_player_id,
      'from_player_name', v_from_player.player_name,
      'card_text', p_card_text
    )
  );

  UPDATE players
  SET 
    hand = v_new_hand,
    has_given_final_gift = true
  WHERE id = p_from_player_id;

  UPDATE players
  SET final_gifts_received = v_new_gifts
  WHERE id = p_to_player_id;

  SELECT COUNT(*) INTO v_gift_count
  FROM players
  WHERE room_id = p_room_id 
    AND role = 'player'
    AND player_number != v_room.final_phase_turn
    AND has_given_final_gift = true;

  v_all_gifted := (v_gift_count >= 3);

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

-- share_final_reflection関数を修正
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
  SELECT * INTO v_room
  FROM game_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'ルームが見つかりません');
  END IF;

  IF v_room.final_phase_step != 'reflection' THEN
    RETURN jsonb_build_object('success', false, 'message', '現在は感想共有フェーズではありません');
  END IF;

  SELECT * INTO v_player
  FROM players
  WHERE id = p_player_id AND room_id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'プレイヤーが見つかりません');
  END IF;

  IF v_player.player_number != v_room.final_phase_turn THEN
    RETURN jsonb_build_object('success', false, 'message', 'あなたのターンではありません');
  END IF;

  UPDATE players
  SET final_reflection_text = p_reflection_text
  WHERE id = p_player_id;

  v_next_turn := v_room.final_phase_turn + 1;

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

GRANT EXECUTE ON FUNCTION share_final_resonance TO authenticated;
GRANT EXECUTE ON FUNCTION share_final_resonance TO anon;
GRANT EXECUTE ON FUNCTION give_final_gift TO authenticated;
GRANT EXECUTE ON FUNCTION give_final_gift TO anon;
GRANT EXECUTE ON FUNCTION share_final_reflection TO authenticated;
GRANT EXECUTE ON FUNCTION share_final_reflection TO anon;
