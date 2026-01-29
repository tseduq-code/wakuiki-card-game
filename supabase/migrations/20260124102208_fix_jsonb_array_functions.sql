/*
  # JSONB配列操作関数の修正

  1. 目的
    - `deck`, `discard_pile`, `hand`はすべてJSONB型として定義されている
    - array_length()ではなくjsonb_array_length()を使用する必要がある
    - JSONB配列の要素アクセスと操作を正しく実装

  2. 修正内容
    - atomic_draw_card: JSONB配列対応に修正
    - atomic_discard_card: JSONB配列対応に修正
    - atomic_exchange_card: JSONB配列対応に修正
    - validate_card_uniqueness: JSONB配列対応に修正
    - replenish_discard_pile: JSONB配列対応に修正

  3. JSONB配列操作
    - 長さ: jsonb_array_length(column)
    - 要素アクセス: column->0 (JSONB), column->>0 (text)
    - 追加: column || '["value"]'::jsonb
    - 削除: 配列を再構築
*/

-- atomic_draw_card関数をJSONB対応に修正
CREATE OR REPLACE FUNCTION atomic_draw_card(
  p_room_id uuid,
  p_player_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room game_rooms;
  v_player players;
  v_drawn_card text;
  v_new_hand jsonb;
  v_new_deck jsonb;
  v_deck_length int;
BEGIN
  -- ゲームルームをロック取得
  SELECT * INTO v_room
  FROM game_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'ルームが見つかりません');
  END IF;

  -- プレイヤー情報を取得してロック
  SELECT * INTO v_player
  FROM players
  WHERE id = p_player_id AND room_id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'プレイヤーが見つかりません');
  END IF;

  -- 山札の長さをチェック
  v_deck_length := jsonb_array_length(v_room.deck);
  
  IF v_deck_length IS NULL OR v_deck_length = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', '山札がありません');
  END IF;

  -- 山札の先頭からカードを引く (JSONB配列の最初の要素)
  v_drawn_card := v_room.deck->>0;

  -- 山札から先頭を削除（残りの要素で新しい配列を作成）
  SELECT jsonb_agg(value)
  INTO v_new_deck
  FROM jsonb_array_elements(v_room.deck) WITH ORDINALITY AS t(value, idx)
  WHERE idx > 1;

  -- 新しい山札がNULLの場合は空配列に
  IF v_new_deck IS NULL THEN
    v_new_deck := '[]'::jsonb;
  END IF;

  -- 手札に追加
  v_new_hand := v_player.hand || jsonb_build_array(v_drawn_card);

  -- プレイヤーの手札を更新
  UPDATE players
  SET hand = v_new_hand, updated_at = now()
  WHERE id = p_player_id;

  -- ゲームルームの山札を更新
  UPDATE game_rooms
  SET deck = v_new_deck, updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'カードを引きました',
    'drawn_card', v_drawn_card,
    'hand_size', jsonb_array_length(v_new_hand),
    'deck_remaining', jsonb_array_length(v_new_deck)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'エラーが発生しました: ' || SQLERRM
    );
END;
$$;

-- atomic_discard_card関数をJSONB対応に修正
CREATE OR REPLACE FUNCTION atomic_discard_card(
  p_room_id uuid,
  p_player_id uuid,
  p_card_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room game_rooms;
  v_player players;
  v_card_found boolean;
  v_new_hand jsonb;
  v_new_discard_pile jsonb;
  v_next_player int;
  v_next_round int;
  v_new_status text;
BEGIN
  -- ゲームルームをロック取得
  SELECT * INTO v_room
  FROM game_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'ルームが見つかりません');
  END IF;

  -- プレイヤー情報を取得してロック
  SELECT * INTO v_player
  FROM players
  WHERE id = p_player_id AND room_id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'プレイヤーが見つかりません');
  END IF;

  -- 手札に指定されたカードが存在するかチェック
  SELECT EXISTS(
    SELECT 1
    FROM jsonb_array_elements_text(v_player.hand) AS card
    WHERE card = p_card_text
  ) INTO v_card_found;

  IF NOT v_card_found THEN
    RETURN jsonb_build_object('success', false, 'message', '指定されたカードが手札にありません');
  END IF;

  -- 手札からカードを削除（最初に見つかった1枚のみ）
  WITH hand_with_index AS (
    SELECT value, idx
    FROM jsonb_array_elements_text(v_player.hand) WITH ORDINALITY AS t(value, idx)
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

  -- 場にカードを追加
  v_new_discard_pile := v_room.discard_pile || jsonb_build_array(p_card_text);

  -- 次のプレイヤーとラウンドを計算
  v_next_player := (v_room.current_turn_player + 1) % 4;
  v_next_round := v_room.round_number;

  IF v_next_player = 0 THEN
    v_next_round := v_next_round + 1;
  END IF;

  -- ステータスの判定
  v_new_status := v_room.status;

  -- ラウンド2終了後、交換フェーズへ
  IF v_next_round = 3 AND v_room.exchange_completed = false THEN
    v_new_status := 'exchange';
  -- ラウンド4終了後（交換完了後）、最終響き合いフェーズへ
  ELSIF v_next_round = 5 AND v_room.exchange_completed = true THEN
    v_new_status := 'resonance_final';
  END IF;

  -- プレイヤーの手札を更新
  UPDATE players
  SET hand = v_new_hand, updated_at = now()
  WHERE id = p_player_id;

  -- ゲームルームを更新
  UPDATE game_rooms
  SET
    discard_pile = v_new_discard_pile,
    current_turn_player = v_next_player,
    round_number = v_next_round,
    status = v_new_status,
    current_exchange_turn = CASE WHEN v_new_status = 'exchange' THEN 0 ELSE current_exchange_turn END,
    updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'カードを捨てました',
    'discarded_card', p_card_text,
    'next_player', v_next_player,
    'next_round', v_next_round,
    'new_status', v_new_status
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'エラーが発生しました: ' || SQLERRM
    );
END;
$$;

-- atomic_exchange_card関数をJSONB対応に修正
CREATE OR REPLACE FUNCTION atomic_exchange_card(
  p_room_id uuid,
  p_player_id uuid,
  p_hand_card_text text,
  p_board_card_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room game_rooms;
  v_player players;
  v_hand_card_found boolean;
  v_board_card_found boolean;
  v_new_hand jsonb;
  v_new_discard_pile jsonb;
  v_all_players players[];
  v_player_rec players;
  v_card_count int;
BEGIN
  -- ゲームルームと全プレイヤーをロック取得
  SELECT * INTO v_room
  FROM game_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'ルームが見つかりません');
  END IF;

  -- プレイヤー情報を取得してロック
  SELECT * INTO v_player
  FROM players
  WHERE id = p_player_id AND room_id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'プレイヤーが見つかりません');
  END IF;

  -- 手札に指定されたカードが存在するかチェック
  SELECT EXISTS(
    SELECT 1
    FROM jsonb_array_elements_text(v_player.hand) AS card
    WHERE card = p_hand_card_text
  ) INTO v_hand_card_found;

  IF NOT v_hand_card_found THEN
    RETURN jsonb_build_object('success', false, 'message', '指定された手札のカードが見つかりません');
  END IF;

  -- 場に指定されたカードが存在するかチェック
  SELECT EXISTS(
    SELECT 1
    FROM jsonb_array_elements_text(v_room.discard_pile) AS card
    WHERE card = p_board_card_text
  ) INTO v_board_card_found;

  IF NOT v_board_card_found THEN
    RETURN jsonb_build_object('success', false, 'message', '指定された場のカードが見つかりません');
  END IF;

  -- カードの唯一性チェック: 手札から出すカードが場に既に存在しないか
  SELECT COUNT(*)
  INTO v_card_count
  FROM jsonb_array_elements_text(v_room.discard_pile) AS card
  WHERE card = p_hand_card_text;
  
  IF v_card_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'message', '手札から出すカードが既に場に存在します');
  END IF;

  -- カードの唯一性チェック: 場から取るカードが他のプレイヤーの手札に存在しないか
  SELECT array_agg(p.*) INTO v_all_players
  FROM players p
  WHERE p.room_id = p_room_id AND p.id != p_player_id AND p.role = 'player';

  IF v_all_players IS NOT NULL THEN
    FOREACH v_player_rec IN ARRAY v_all_players
    LOOP
      SELECT EXISTS(
        SELECT 1
        FROM jsonb_array_elements_text(v_player_rec.hand) AS card
        WHERE card = p_board_card_text
      ) INTO v_board_card_found;
      
      IF v_board_card_found THEN
        RETURN jsonb_build_object('success', false, 'message', '場から取るカードが他のプレイヤーの手札に既に存在します');
      END IF;
    END LOOP;
  END IF;

  -- 手札からカードを削除して、場のカードを追加
  WITH hand_with_index AS (
    SELECT value, idx
    FROM jsonb_array_elements_text(v_player.hand) WITH ORDINALITY AS t(value, idx)
  ),
  card_to_remove AS (
    SELECT idx
    FROM hand_with_index
    WHERE value = p_hand_card_text
    LIMIT 1
  )
  SELECT jsonb_agg(
    CASE 
      WHEN idx IN (SELECT idx FROM card_to_remove) THEN to_jsonb(p_board_card_text)
      ELSE to_jsonb(value)
    END
    ORDER BY idx
  )
  INTO v_new_hand
  FROM hand_with_index;

  -- 場のカードを更新
  WITH pile_with_index AS (
    SELECT value, idx
    FROM jsonb_array_elements_text(v_room.discard_pile) WITH ORDINALITY AS t(value, idx)
  ),
  card_to_replace AS (
    SELECT idx
    FROM pile_with_index
    WHERE value = p_board_card_text
    LIMIT 1
  )
  SELECT jsonb_agg(
    CASE 
      WHEN idx IN (SELECT idx FROM card_to_replace) THEN to_jsonb(p_hand_card_text)
      ELSE to_jsonb(value)
    END
    ORDER BY idx
  )
  INTO v_new_discard_pile
  FROM pile_with_index;

  -- プレイヤーの手札を更新
  UPDATE players
  SET hand = v_new_hand, updated_at = now()
  WHERE id = p_player_id;

  -- ゲームルームの場を更新
  UPDATE game_rooms
  SET discard_pile = v_new_discard_pile, updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', '交換が完了しました',
    'hand_card', p_hand_card_text,
    'board_card', p_board_card_text
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'エラーが発生しました: ' || SQLERRM
    );
END;
$$;

-- validate_card_uniqueness関数をJSONB対応に修正
CREATE OR REPLACE FUNCTION validate_card_uniqueness(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_all_cards text[];
  v_card text;
  v_card_counts jsonb;
  v_duplicates text[];
  v_room game_rooms;
  v_players players[];
  v_player players;
BEGIN
  -- ゲームルームを取得
  SELECT * INTO v_room
  FROM game_rooms
  WHERE id = p_room_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'message', 'ルームが見つかりません');
  END IF;

  -- 全プレイヤーを取得
  SELECT array_agg(p.*) INTO v_players
  FROM players p
  WHERE p.room_id = p_room_id AND p.role = 'player';

  -- 全カードを収集（場のカード）
  SELECT array_agg(card)
  INTO v_all_cards
  FROM jsonb_array_elements_text(v_room.discard_pile) AS card;

  IF v_all_cards IS NULL THEN
    v_all_cards := ARRAY[]::text[];
  END IF;

  -- 全プレイヤーの手札を追加
  IF v_players IS NOT NULL THEN
    FOREACH v_player IN ARRAY v_players
    LOOP
      SELECT v_all_cards || array_agg(card)
      INTO v_all_cards
      FROM jsonb_array_elements_text(v_player.hand) AS card;
    END LOOP;
  END IF;

  -- カードの出現回数をカウント
  v_card_counts := '{}';
  FOREACH v_card IN ARRAY v_all_cards
  LOOP
    IF v_card_counts ? v_card THEN
      v_card_counts := jsonb_set(
        v_card_counts,
        array[v_card],
        to_jsonb((v_card_counts->>v_card)::int + 1)
      );
    ELSE
      v_card_counts := jsonb_set(v_card_counts, array[v_card], '1');
    END IF;
  END LOOP;

  -- 重複を検出
  v_duplicates := ARRAY(
    SELECT key
    FROM jsonb_each_text(v_card_counts)
    WHERE value::int > 1
  );

  IF array_length(v_duplicates, 1) > 0 THEN
    RETURN jsonb_build_object(
      'valid', false,
      'message', '重複カードが検出されました',
      'duplicates', to_jsonb(v_duplicates),
      'card_counts', v_card_counts
    );
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'message', 'すべてのカードがユニークです',
    'total_cards', array_length(v_all_cards, 1)
  );
END;
$$;

-- replenish_discard_pile関数をJSONB対応に修正
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

  -- 場に追加
  SELECT v_room.discard_pile || to_jsonb(v_cards_to_add)
  INTO v_new_discard_pile;

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

-- 関数の実行権限を設定
GRANT EXECUTE ON FUNCTION atomic_draw_card TO authenticated;
GRANT EXECUTE ON FUNCTION atomic_draw_card TO anon;
GRANT EXECUTE ON FUNCTION atomic_discard_card TO authenticated;
GRANT EXECUTE ON FUNCTION atomic_discard_card TO anon;
GRANT EXECUTE ON FUNCTION atomic_exchange_card TO authenticated;
GRANT EXECUTE ON FUNCTION atomic_exchange_card TO anon;
GRANT EXECUTE ON FUNCTION validate_card_uniqueness TO authenticated;
GRANT EXECUTE ON FUNCTION validate_card_uniqueness TO anon;
GRANT EXECUTE ON FUNCTION replenish_discard_pile TO authenticated;
GRANT EXECUTE ON FUNCTION replenish_discard_pile TO anon;
