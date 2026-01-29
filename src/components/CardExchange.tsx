import { useState, useEffect } from 'react';
import { RefreshCw, Clock, Sparkles } from 'lucide-react';
import { supabase, GameRoom, Player, ExchangeAction } from '../lib/supabase';
import { deduplicateHandStrings } from '../lib/gameUtils';
import { Card } from './Card';

interface CardExchangeProps {
  room: GameRoom;
  players: Player[];
  currentPlayerId: string;
  exchangeActions: ExchangeAction[];
}

export function CardExchange({ room, players, currentPlayerId, exchangeActions }: CardExchangeProps) {
  const [selectedDiscardCard, setSelectedDiscardCard] = useState<number | null>(null);
  const [selectedHandCard, setSelectedHandCard] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recentlyAddedCards, setRecentlyAddedCards] = useState<Set<string>>(new Set());
  const [showTransitionScreen, setShowTransitionScreen] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);

  const currentPlayer = players.find(p => p.id === currentPlayerId);
  const activePlayers = players.filter(p => p.role === 'player').sort((a, b) => a.player_number - b.player_number);
  const isMyTurn = currentPlayer?.player_number === room.current_exchange_turn;
  const turnPlayer = activePlayers.find(p => p.player_number === room.current_exchange_turn);

  const myAction = exchangeActions.find(a => a.player_id === currentPlayerId && a.turn_number === room.current_exchange_turn);
  const hasActedThisTurn = !!myAction;

  // Highlight newly added cards
  useEffect(() => {
    const latestAction = exchangeActions[exchangeActions.length - 1];
    if (latestAction && latestAction.action_type === 'exchange' && latestAction.hand_card) {
      const cardToHighlight = latestAction.hand_card;
      setRecentlyAddedCards(new Set([cardToHighlight]));

      const timer = setTimeout(() => {
        setRecentlyAddedCards(new Set());
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [exchangeActions]);

  /** 交換/スキップ成功時に即座に次のターンへ進む（DB更新 or 遷移画面表示） */
  async function advanceToNextTurn() {
    const nextTurnNumber = room.current_exchange_turn + 1;

    if (nextTurnNumber >= activePlayers.length) {
      // 最後のプレイヤーまで終了 → フェーズを次へ（遷移画面を表示し、5秒後に status を playing に更新）
      setShowTransitionScreen(true);
      return;
    }

    const { error } = await supabase
      .from('game_rooms')
      .update({ current_exchange_turn: nextTurnNumber })
      .eq('id', room.id);

    if (error) {
      console.error('Error moving to next turn:', error);
      setExchangeError('次のターンへ進めませんでした。しばらくしてから再度お試しください。');
    }
  }

  // 説明画面表示後5秒で次のフェーズへ自動遷移（アンマウント時にタイマークリア）
  useEffect(() => {
    if (!showTransitionScreen || !room.id) return;

    const timer = setTimeout(async () => {
      try {
        await supabase
          .from('game_rooms')
          .update({
            status: 'playing',
            current_exchange_turn: 0,
            exchange_completed: true
          })
          .eq('id', room.id);
      } catch (error) {
        console.error('Error transitioning to next phase:', error);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [showTransitionScreen, room.id]);

  async function executeExchange() {
    if (selectedDiscardCard === null || selectedHandCard === null || !currentPlayer || isProcessing) return;
    setExchangeError(null);
    setIsProcessing(true);

    try {
      const handCardToDiscard = currentPlayer.hand[selectedHandCard];
      const boardCardToTake = room.discard_pile[selectedDiscardCard];

      console.log('🔄 カード交換を開始:', {
        hand: handCardToDiscard,
        board: boardCardToTake
      });

      const { data: result, error: rpcError } = await supabase
        .rpc('atomic_exchange_card', {
          p_room_id: room.id,
          p_player_id: currentPlayerId,
          p_hand_card_text: handCardToDiscard,
          p_board_card_text: boardCardToTake
        });

      if (rpcError) {
        console.error('❌ RPC呼び出しエラー:', rpcError);
        setExchangeError('そのカードは出せません。別の組み合わせを選んでください。');
        setIsProcessing(false);
        return;
      }

      if (!result || !result.success) {
        const message = (result as { message?: string })?.message || 'そのカードは出せません。';
        console.error('❌ カード交換失敗:', message);
        setExchangeError(message);
        setIsProcessing(false);
        return;
      }

      console.log('✅ カード交換成功:', result);

      const { error: logError } = await supabase
        .from('exchange_actions')
        .insert({
          room_id: room.id,
          player_id: currentPlayerId,
          player_name: currentPlayer.preferred_name || currentPlayer.name,
          action_type: 'exchange',
          hand_card: handCardToDiscard,
          board_card: boardCardToTake,
          turn_number: room.current_exchange_turn
        });

      if (logError) {
        console.error('⚠️ ログ記録エラー（交換は成功）:', logError);
      }

      setSelectedDiscardCard(null);
      setSelectedHandCard(null);
      await advanceToNextTurn();
    } catch (error) {
      console.error('❌ 交換処理エラー:', error);
      setExchangeError('カード交換中にエラーが発生しました。やり直してください。');
    } finally {
      setIsProcessing(false);
    }
  }

  /** スキップ時はカード検証なし。無条件で exchange_actions に skip を1件追加するだけ。 */
  async function skipExchange() {
    if (!currentPlayer || isProcessing) return;
    setExchangeError(null);
    setIsProcessing(true);

    try {
      const { error } = await supabase
        .from('exchange_actions')
        .insert({
          room_id: room.id,
          player_id: currentPlayerId,
          player_name: currentPlayer.preferred_name || currentPlayer.name,
          action_type: 'skip',
          hand_card: null,
          board_card: null,
          turn_number: room.current_exchange_turn
        });

      if (error) {
        console.error('Error skipping exchange:', error);
        setExchangeError('スキップの記録に失敗しました。もう一度お試しください。');
      } else {
        await advanceToNextTurn();
      }
    } catch (error) {
      console.error('Error skipping exchange:', error);
      setExchangeError('スキップ中にエラーが発生しました。');
    } finally {
      setIsProcessing(false);
    }
  }

  // Recent activity log (all actions, newest first)
  const recentActions = [...exchangeActions].reverse();

  // 中間画面：カード交換フェーズ終了後、5秒で次のステップへ（響き合い・ギフト等の予告は表示しない）
  if (showTransitionScreen) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-white p-4 flex items-center justify-center">
        <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl p-8 md:p-10 border-2 border-gray-200 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">
            カード交換フェーズが終了しました
          </h2>
          <p className="text-gray-600">
            次のステップへ進みます。しばらくお待ちください。
          </p>
          <p className="mt-6 text-sm text-gray-500">
            （5秒後に自動的に開始します...）
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-white p-4">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-[1fr_300px] gap-6">
          {/* Main exchange area */}
          <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-gray-200">
            {/* Header */}
            <div className="text-center mb-6">
              <RefreshCw className="w-12 h-12 text-green-600 mx-auto mb-3 animate-spin-slow" />
              <h2 className="text-3xl font-bold text-gray-800 mb-2">
                カード交換フェーズ
              </h2>

              {/* Turn indicator */}
              <div className={`inline-flex items-center gap-3 px-6 py-3 rounded-lg ${
                isMyTurn
                  ? 'bg-gradient-to-r from-green-500 to-blue-500 text-white animate-pulse'
                  : 'bg-blue-50 text-gray-800'
              }`}>
                <Clock className={`w-5 h-5 ${isMyTurn ? 'text-white' : 'text-blue-600'}`} />
                <p className="font-bold text-lg">
                  {isMyTurn ? 'あなたのターンです' : `${turnPlayer?.preferred_name || turnPlayer?.name}さんのターンです`}
                </p>
              </div>
            </div>

            {/* Waiting player message */}
            {!isMyTurn && (
              <div className="mb-6 bg-blue-50 rounded-xl border border-blue-200 p-4 text-center">
                <p className="text-gray-800 text-base">
                  {turnPlayer?.preferred_name || turnPlayer?.name}さんがカードを選んでいます。交換の様子を見てみましょう。
                </p>
              </div>
            )}

            {/* Current turn player's hand (visible to all) */}
            {turnPlayer && (
              <div className="mb-8">
                <h3 className="font-bold text-lg text-gray-800 mb-4 text-center">
                  {turnPlayer.preferred_name || turnPlayer.name}さんの手札
                </h3>
                <div className="flex gap-4 justify-center flex-wrap">
                  {deduplicateHandStrings(turnPlayer.hand ?? []).map((card, index) => (
                    <Card
                      key={`${turnPlayer.id}-${card}-${index}`}
                      text={card}
                      selected={isMyTurn && selectedHandCard === index}
                      onClick={isMyTurn && !hasActedThisTurn ? () => { setSelectedHandCard(index); setExchangeError(null); } : undefined}
                      disabled={!isMyTurn || hasActedThisTurn}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Board cards section */}
            <div className="mb-8">
              <h3 className="font-bold text-lg text-gray-800 mb-4 text-center">
                場のカード
                {isMyTurn && !hasActedThisTurn && (
                  <span className="text-sm text-gray-500 font-normal ml-2">（取りたいカードを1枚選択）</span>
                )}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 max-h-[400px] overflow-y-auto p-2 bg-gray-50 rounded-lg border-2 border-gray-200">
                {room.discard_pile.map((card, index) => (
                  <div key={`discard-${card}-${index}`} className="relative">
                    <Card
                      text={card}
                      selected={selectedDiscardCard === index}
                      onClick={isMyTurn && !hasActedThisTurn ? () => { setSelectedDiscardCard(index); setExchangeError(null); } : undefined}
                      disabled={!isMyTurn || hasActedThisTurn}
                      variant="small"
                    />
                    {recentlyAddedCards.has(card) && (
                      <div className="absolute -top-2 -right-2 animate-bounce">
                        <Sparkles className="w-6 h-6 text-yellow-500 fill-yellow-400" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 交換エラー表示（失敗時のみ。成功/スキップ後は自動遷移のため非表示） */}
            {exchangeError && isMyTurn && !hasActedThisTurn && (
              <div className="mt-4 p-4 bg-red-50 border-2 border-red-200 rounded-xl text-center">
                <p className="text-red-700 font-medium">{exchangeError}</p>
                <p className="text-sm text-red-600 mt-1">別のカードを選ぶか、スキップしてください。</p>
              </div>
            )}

            {/* Action buttons（交換する / スキップ の2択のみ。次のプレイヤーへボタンはなし） */}
            {isMyTurn && !hasActedThisTurn && (
              <div className="flex gap-4 justify-center mt-6">
                <button
                  onClick={executeExchange}
                  disabled={selectedHandCard === null || selectedDiscardCard === null || isProcessing}
                  className="bg-green-600 text-white py-3 px-8 rounded-lg font-bold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition shadow-md hover:shadow-lg"
                >
                  {isProcessing ? '処理中...' : '交換する'}
                </button>
                <button
                  onClick={skipExchange}
                  disabled={isProcessing}
                  className="bg-gray-600 text-white py-3 px-8 rounded-lg font-bold hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition shadow-md hover:shadow-lg"
                >
                  {isProcessing ? '処理中...' : 'スキップ'}
                </button>
              </div>
            )}

          </div>

          {/* Exchange history sidebar */}
          <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-gray-200 h-fit">
            <h3 className="font-bold text-lg text-gray-800 mb-4 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-blue-600" />
              交換の様子
            </h3>

            {recentActions.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">
                まだ交換がありません
              </p>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {recentActions.map((action) => {
                  const playerName = action.player_name;
                  if (action.action_type === 'exchange' && action.hand_card && action.board_card) {
                    return (
                      <div
                        key={action.id}
                        className="p-3 rounded-lg border-2 bg-green-50 border-green-200"
                      >
                        <p className="text-sm text-gray-800">
                          <span className="font-bold">{playerName}</span>
                          さんが
                          <span className="font-medium text-green-700">『{action.board_card}』</span>
                          を手札と交換しました
                        </p>
                      </div>
                    );
                  } else if (action.action_type === 'skip') {
                    // スキップの場合、hand_cardがあればそれを表示、なければ一般的な表現
                    if (action.hand_card) {
                      return (
                        <div
                          key={action.id}
                          className="p-3 rounded-lg border-2 bg-gray-50 border-gray-200"
                        >
                          <p className="text-sm text-gray-800">
                            <span className="font-bold">{playerName}</span>
                            さんが
                            <span className="font-medium text-gray-700">『{action.hand_card}』</span>
                            を場に出しました
                          </p>
                        </div>
                      );
                    } else {
                      return (
                        <div
                          key={action.id}
                          className="p-3 rounded-lg border-2 bg-gray-50 border-gray-200"
                        >
                          <p className="text-sm text-gray-800">
                            <span className="font-bold">{playerName}</span>
                            さんが交換をスキップしました
                          </p>
                        </div>
                      );
                    }
                  }
                  return null;
                })}
              </div>
            )}

            {/* Turn progress indicator */}
            <div className="mt-6 pt-6 border-t-2 border-gray-200">
              <p className="text-sm font-medium text-gray-700 mb-3">進行状況</p>
              <div className="space-y-2">
                {activePlayers.map((player, idx) => {
                  const playerAction = exchangeActions.find(
                    a => a.player_id === player.id && a.turn_number === idx
                  );
                  const isCurrent = room.current_exchange_turn === idx;

                  return (
                    <div
                      key={player.id}
                      className={`flex items-center gap-2 p-2 rounded ${
                        isCurrent
                          ? 'bg-blue-100 border-2 border-blue-300'
                          : playerAction
                          ? 'bg-green-50'
                          : 'bg-gray-50'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full ${
                        playerAction
                          ? 'bg-green-500'
                          : isCurrent
                          ? 'bg-blue-500 animate-pulse'
                          : 'bg-gray-300'
                      }`} />
                      <span className={`text-sm ${
                        isCurrent ? 'font-bold' : 'font-medium'
                      }`}>
                        {player.preferred_name || player.name}
                      </span>
                      {playerAction && (
                        <span className="ml-auto text-xs text-green-600">✓</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
