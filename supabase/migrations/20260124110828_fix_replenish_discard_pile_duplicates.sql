/*
  # 場のカード補充時の重複問題を修正

  1. 問題
    - replenish_discard_pile関数でカードを追加する際、
      `v_room.discard_pile || to_jsonb(v_cards_to_add)` が正しく動作していない
    - 配列の連結が正しく行われず、重複が発生している可能性

  2. 解決策
    - JSONB配列の連結方法を修正
    - `to_jsonb(v_cards_to_add)` の代わりに、個別の要素を追加
    - 補充処理を正しく実装

  3. 影響
    - カード交換後の場のカード補充が正常に動作
    - 重複カードの発生を防止
*/

CREATE OR REPLACE FUNCTION replenish_discard_pile(
  p_room_id uuid,
  p_target_count int DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room game_rooms;
  v_players players[];
  v_player players;
  v_all_used_cards text[];
  v_available_cards text[];
  v_cards_to_add text[];
  v_new_discard_pile jsonb;
  v_new_deck jsonb;
  v_needed_count int;
  v_current_pile_count int;
BEGIN
  -- ゲームルームを取得してロック
  SELECT * INTO v_room
  FROM game_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'ルームが見つかりません');
  END IF;

  -- 現在の場のカード数をチェック
  v_current_pile_count := jsonb_array_length(v_room.discard_pile);
  
  IF v_current_pile_count >= p_target_count THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', '補充は不要です',
      'current_count', v_current_pile_count
    );
  END IF;

  -- 必要なカード数を計算
  v_needed_count := p_target_count - v_current_pile_count;

  -- 全プレイヤーの手札を取得
  SELECT array_agg(p.*) INTO v_players
  FROM players p
  WHERE p.room_id = p_room_id AND p.role = 'player';

  -- 使用中のカードを収集（場のカード）
  SELECT array_agg(card)
  INTO v_all_used_cards
  FROM jsonb_array_elements_text(v_room.discard_pile) AS card;

  IF v_all_used_cards IS NULL THEN
    v_all_used_cards := ARRAY[]::text[];
  END IF;

  -- 全プレイヤーの手札を追加
  IF v_players IS NOT NULL THEN
    FOREACH v_player IN ARRAY v_players
    LOOP
      SELECT v_all_used_cards || array_agg(card)
      INTO v_all_used_cards
      FROM jsonb_array_elements_text(v_player.hand) AS card;
    END LOOP;
  END IF;

  -- 山札から使用されていないカードを抽出
  SELECT array_agg(card)
  INTO v_available_cards
  FROM jsonb_array_elements_text(v_room.deck) AS card
  WHERE card != ALL(v_all_used_cards);

  -- 利用可能なカードがない場合
  IF v_available_cards IS NULL OR array_length(v_available_cards, 1) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', '山札に利用可能なカードがありません'
    );
  END IF;

  -- 必要な数だけランダムに選択
  IF array_length(v_available_cards, 1) < v_needed_count THEN
    v_cards_to_add := v_available_cards;
  ELSE
    SELECT array_agg(card ORDER BY random())
    INTO v_cards_to_add
    FROM (
      SELECT unnest(v_available_cards) AS card
      LIMIT v_needed_count
    ) sub;
  END IF;

  -- 場に追加（修正: 正しくJSONB配列として連結）
  SELECT v_room.discard_pile || COALESCE(jsonb_agg(card), '[]'::jsonb)
  INTO v_new_discard_pile
  FROM unnest(v_cards_to_add) AS card;

  -- 山札から削除
  SELECT COALESCE(jsonb_agg(card), '[]'::jsonb)
  INTO v_new_deck
  FROM jsonb_array_elements_text(v_room.deck) AS card
  WHERE card != ALL(v_cards_to_add);

  -- 更新
  UPDATE game_rooms
  SET
    discard_pile = v_new_discard_pile,
    deck = v_new_deck,
    updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', '場のカードを補充しました',
    'added_count', array_length(v_cards_to_add, 1),
    'new_pile_count', jsonb_array_length(v_new_discard_pile),
    'remaining_deck', jsonb_array_length(v_new_deck)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'エラーが発生しました: ' || SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION replenish_discard_pile TO authenticated;
GRANT EXECUTE ON FUNCTION replenish_discard_pile TO anon;
