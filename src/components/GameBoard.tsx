import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { supabase, GameRoom, Player, CardInstance } from '../lib/supabase';
import { Card } from './Card';
import { PlayerArea } from './PlayerArea';

interface GameBoardProps {
  room: GameRoom;
  players: Player[];
  currentPlayerId: string;
}

export function GameBoard({ room, players, currentPlayerId }: GameBoardProps) {
  const [selectedHandCard, setSelectedHandCard] = useState<number | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [error, setError] = useState('');
  const [turnPhase, setTurnPhase] = useState<'draw' | 'decide' | 'choose_card'>('draw');
  const [lastDrawnCardInstance, setLastDrawnCardInstance] = useState<CardInstance | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const currentPlayer = players.find(p => p.id === currentPlayerId);
  const isMyTurn = currentPlayer?.player_number === room.current_turn_player;
  const turnPlayer = players.find(p => p.player_number === room.current_turn_player);
  const activePlayers = players.filter(p => p.role !== 'spectator');
  const currentPlayerName = currentPlayer?.preferred_name || currentPlayer?.name || 'プレイヤー';
  const turnPlayerName = turnPlayer?.preferred_name || turnPlayer?.name || 'プレイヤー';

  // Spectator: no valid seat (not in 0–3) or role is spectator → use fixed layout
  const isSpectatorView =
    !currentPlayer ||
    currentPlayer.role === 'spectator' ||
    typeof currentPlayer.player_number !== 'number' ||
    currentPlayer.player_number < 0 ||
    currentPlayer.player_number > 3;

  function getPlayerPosition(player: Player): 'top' | 'bottom' | 'left' | 'right' {
    // Fixed standard layout for spectators: Bottom=Player0, Left=Player1, Top=Player2, Right=Player3
    if (isSpectatorView) {
      const fixedPositions: ('bottom' | 'left' | 'top' | 'right')[] = ['bottom', 'left', 'top', 'right'];
      const idx = player.player_number as number;
      return fixedPositions[idx >= 0 && idx <= 3 ? idx : 0] ?? 'bottom';
    }

    const diff = (player.player_number - currentPlayer!.player_number + 4) % 4;
    if (diff === 0) return 'bottom';
    if (diff === 1) return 'left';
    if (diff === 2) return 'top';
    return 'right';
  }

  // Spectator view: only players 0–3 so layout has exactly 4 slots
  const playersForLayout = isSpectatorView
    ? activePlayers.filter(p => typeof p.player_number === 'number' && p.player_number >= 0 && p.player_number <= 3)
    : activePlayers;

  const positionedPlayers = playersForLayout.map(player => ({
    player,
    position: getPlayerPosition(player)
  }));

  const topPlayer = positionedPlayers.find(p => p.position === 'top');
  const bottomPlayer = positionedPlayers.find(p => p.position === 'bottom');
  const leftPlayer = positionedPlayers.find(p => p.position === 'left');
  const rightPlayer = positionedPlayers.find(p => p.position === 'right');

  const isFirstPhase = !room.exchange_completed;
  const totalRoundsThisPhase = isFirstPhase ? 3 : 2;
  const currentRoundDisplay = Math.min(room.round_number + 1, totalRoundsThisPhase);

  // ドロー直後は Realtime で hand がまだ 3 枚のことがあるため、表示用手札を 4 枚に補正する
  const effectiveHand =
    currentPlayer && lastDrawnCardInstance && (currentPlayer.hand?.length ?? 0) === 3
      ? [...(currentPlayer.hand || []), lastDrawnCardInstance.name]
      : (currentPlayer?.hand || []);

  useEffect(() => {
    // プレイヤーのターンが切り替わるたびにローカル状態をリセット
    setHasDrawn(false);
    setSelectedHandCard(null);
    setLastDrawnCardInstance(null);
    setTurnPhase('draw');
    setError('');
    setIsProcessing(false);
  }, [room.current_turn_player, currentPlayerId]);

  // Track previous hand length to detect newly added card
  const [previousHandLength, setPreviousHandLength] = useState<number>(0);
  
  useEffect(() => {
    if (currentPlayer?.hand) {
      const currentLength = currentPlayer.hand.length;
      // If hand grew by 1 and we have a lastDrawnCardInstance, update its instanceId
      // to match the actual position in the hand
      if (currentLength === previousHandLength + 1 && lastDrawnCardInstance) {
        const newCardIndex = currentLength - 1;
        const newCardName = currentPlayer.hand[newCardIndex];
        
        // If the new card matches the drawn card name, update instanceId to match PlayerArea's generation
        if (newCardName === lastDrawnCardInstance.name) {
          // Count occurrences of this card name before this index
          const occurrencesBefore = currentPlayer.hand.slice(0, newCardIndex).filter(c => c === newCardName).length;
          const instanceId = occurrencesBefore === 0
            ? `${currentPlayer.id}-${newCardName}-${newCardIndex}`
            : `${currentPlayer.id}-${newCardName}-${newCardIndex}-dup${occurrencesBefore}`;
          
          setLastDrawnCardInstance({
            name: newCardName,
            instanceId
          });
        }
      }
      setPreviousHandLength(currentLength);
    }
  }, [currentPlayer?.hand, currentPlayer?.id, previousHandLength, lastDrawnCardInstance]);

  async function drawCard() {
    if (!isMyTurn || hasDrawn || isProcessing) return;

    if (!currentPlayer) return;

    console.log('🎴 カードをドロー中...');

    try {
      setIsProcessing(true);
      const { data: result, error: rpcError } = await supabase
        .rpc('atomic_draw_card', {
          p_room_id: room.id,
          p_player_id: currentPlayerId
        });

      if (rpcError) {
        console.error('❌ RPC呼び出しエラー:', rpcError);
        setError('カードを引けませんでした');
        return;
      }

      if (!result || !result.success) {
        console.error('❌ ドロー失敗:', result?.message);
        setError(result?.message || 'カードを引けませんでした');
        return;
      }

      const drawnCardName = (result as any)?.drawn_card;
      if (!drawnCardName) {
        console.error('❌ ドロー結果にカード名がありません');
        setError('カードを引けませんでした');
        return;
      }

      // 36枚ユニークデッキのため手札との重複チェックは行わない。RPC が山札から1枚取り手札に追加するので、無条件で成功扱いにする。
      // Generate instanceId for the newly drawn card
      // Find the index where it will be added (should be at the end after server update)
      // For now, use timestamp-based ID to ensure uniqueness
      const instanceId = `${currentPlayerId}-${drawnCardName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const drawnCardInstance: CardInstance = {
        name: drawnCardName,
        instanceId
      };

      console.log('✅ ドロー成功:', drawnCardName, 'instanceId:', instanceId);
      setHasDrawn(true);
      setTurnPhase('decide');
      setLastDrawnCardInstance(drawnCardInstance);
      setError('');
    } catch (error) {
      console.error('❌ ドロー処理エラー:', error);
      setError('カードを引く際にエラーが発生しました');
    } finally {
      setIsProcessing(false);
    }
  }

  async function discardCard(cardIndex: number) {
    if (!isMyTurn || !hasDrawn || isProcessing) {
      if (!hasDrawn) {
        setError('先に山札からカードを引いてください');
      }
      return;
    }

    if (!currentPlayer) return;

    const cardToDiscard = effectiveHand[cardIndex] ?? currentPlayer.hand[cardIndex];
    if (!cardToDiscard) return;
    console.log('🗑️ カードをディスカード中:', cardToDiscard);

    try {
      setIsProcessing(true);
      const { data: result, error: rpcError } = await supabase
        .rpc('atomic_discard_card', {
          p_room_id: room.id,
          p_player_id: currentPlayerId,
          p_card_text: cardToDiscard
        });

      if (rpcError) {
        console.error('❌ RPC呼び出しエラー:', rpcError);
        setError('カードを捨てられませんでした');
        return;
      }

      if (!result || !result.success) {
        console.error('❌ ディスカード失敗:', result?.message);
        setError(result?.message || 'カードを捨てられませんでした');
        return;
      }

      console.log('✅ ディスカード成功:', result);
      setHasDrawn(false);
      setSelectedHandCard(null);
      setLastDrawnCardInstance(null);
      setTurnPhase('draw');
      setError('');
    } catch (error) {
      console.error('❌ ディスカード処理エラー:', error);
      setError('カードを捨てる際にエラーが発生しました');
    } finally {
      setIsProcessing(false);
    }
  }

  function getInstruction() {
    if (!turnPlayer) {
      return 'プレイヤー情報を読み込み中です...';
    }

    if (!isMyTurn) {
      return `${turnPlayerName}さんの番です。山札から引いて、手札と交換するか、場に出す流れで進んでいます。`;
    }

    if (!hasDrawn) {
      return `いまは ① 山札から1枚引く フェーズです（${currentPlayerName}さんの番）`;
    }

    if (turnPhase === 'decide') {
      return `いまは ② 手札と交換するか決める フェーズです（${currentPlayerName}さんの番）`;
    }

    if (turnPhase === 'choose_card') {
      return 'いまは ② 手札と交換するか決める フェーズです（交換したいカードを1枚選びましょう）';
    }

    return `${currentPlayerName}さんの番です`;
  }

  return (
    <div
      className={`min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-white relative p-4 ${isSpectatorView ? 'is-spectator-view flex flex-col items-center' : ''}`}
    >
      <div className={`max-w-7xl w-full space-y-4 ${isSpectatorView ? 'flex flex-col items-center' : ''}`}>
        <div className="bg-white/80 backdrop-blur rounded-xl shadow-lg p-4 border-2 border-gray-200 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="bg-blue-50 px-4 py-2 rounded-lg inline-flex items-center gap-2">
              <span className="text-sm text-gray-600">テーマ:</span>
              <span className="font-bold text-gray-800">{room.purpose_card}</span>
            </div>
            <div className="text-sm text-gray-700 text-center md:text-right">
              <p className="font-medium">
                現在: {currentRoundDisplay} / {totalRoundsThisPhase} 周
              </p>
              <p className="text-xs text-gray-500">
                全員が{totalRoundsThisPhase}回行動したら、次のステップに進みます。
              </p>
            </div>
          </div>

          <div className="bg-blue-50/70 rounded-lg px-4 py-3">
            <p className="text-sm font-semibold text-gray-800 mb-1">このラウンドの流れ</p>
            <p className="text-sm text-gray-700">
              ① 山札から1枚引く → ② 手札と交換するか決める → ③ 場のカードとして置く
            </p>
            <p className="mt-1 text-xs text-gray-600">
              これを全員{totalRoundsThisPhase}回くり返します。
            </p>
          </div>

          <div className="bg-green-600 text-white px-4 py-3 rounded-lg text-center font-semibold text-sm md:text-base shadow-md">
            {getInstruction()}
          </div>
        </div>

        {isMyTurn && hasDrawn && (turnPhase === 'decide' || turnPhase === 'choose_card') && (
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 shadow-sm">
            <p className="text-gray-800 text-sm md:text-base text-center">
              選んだ理由をひとこと話すと、対話がより楽しくなります 🙂
              <br />
              <span className="text-xs">『これは残したかった』『これは今日の目的とは違うかな』くらいでOKです。</span>
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <div className="mt-2 space-y-4">
          {topPlayer && (
            <div className="flex justify-center">
              <PlayerArea
                player={topPlayer.player}
                position="top"
                isCurrentTurn={topPlayer.player.player_number === room.current_turn_player}
                onCardClick={
                  topPlayer.player.id === currentPlayerId && isMyTurn && hasDrawn && (turnPhase === 'choose_card' || turnPhase === 'decide')
                    ? (cardIndex) => {
                        setSelectedHandCard(cardIndex);
                        discardCard(cardIndex);
                      }
                    : undefined
                }
                selectedCardIndex={selectedHandCard ?? undefined}
                lastDrawnCardInstance={topPlayer.player.player_number === room.current_turn_player ? lastDrawnCardInstance : null}
                displayHand={topPlayer.player.id === currentPlayerId ? effectiveHand : undefined}
                guidanceText={topPlayer.player.player_number === room.current_turn_player && hasDrawn && (turnPhase === 'decide' || turnPhase === 'choose_card') ? '手札の中から、場に出すカードを1枚選んでクリックしてください。' : undefined}
              />
            </div>
          )}

          <div className="flex flex-col lg:flex-row gap-4 items-stretch">
            {leftPlayer && (
              <div className="flex justify-center lg:w-1/4">
                <PlayerArea
                  player={leftPlayer.player}
                  position="left"
                  isCurrentTurn={leftPlayer.player.player_number === room.current_turn_player}
                  onCardClick={
                    leftPlayer.player.id === currentPlayerId && isMyTurn && hasDrawn && (turnPhase === 'choose_card' || turnPhase === 'decide')
                      ? (cardIndex) => {
                          setSelectedHandCard(cardIndex);
                          discardCard(cardIndex);
                        }
                      : undefined
                  }
                  selectedCardIndex={selectedHandCard ?? undefined}
                  lastDrawnCardInstance={leftPlayer.player.player_number === room.current_turn_player ? lastDrawnCardInstance : null}
                  displayHand={leftPlayer.player.id === currentPlayerId ? effectiveHand : undefined}
                  guidanceText={leftPlayer.player.player_number === room.current_turn_player && hasDrawn && (turnPhase === 'decide' || turnPhase === 'choose_card') ? '手札の中から、場に出すカードを1枚選んでクリックしてください。' : undefined}
                />
              </div>
            )}

            <div className="flex-1 flex justify-center">
              <div className="bg-white/90 backdrop-blur rounded-2xl shadow-xl border-2 border-gray-200 px-6 py-6 w-full max-w-3xl">
                <div className="flex flex-col md:flex-row gap-8 items-start justify-center">
                  <div className="flex-1 text-center">
                    <p className="text-sm font-medium text-gray-700 mb-2">山札</p>
                    <div
                      onClick={isMyTurn && !hasDrawn && !isProcessing ? drawCard : undefined}
                      className={`inline-block ${
                        isMyTurn && !hasDrawn && !isProcessing
                          ? 'cursor-pointer hover:scale-105'
                          : 'opacity-50'
                      } transition-transform`}
                    >
                      <div className="w-28 h-40 md:w-32 md:h-44 bg-green-600 border-4 border-green-700 rounded-lg shadow-xl flex items-center justify-center">
                        <span className="text-white font-bold text-2xl">{room.deck.length}</span>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-gray-600">
                      自分の番になったら、ここをクリックして1枚引きます（手札に1枚ふえます）。
                    </p>
                  </div>

                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800 mb-1">
                      これまでに出たカード（場のカード）
                    </p>
                    <p className="text-xs text-gray-600 mb-3">
                      交換して手放したカード、または交換せずに流したカードがここに置かれます。
                    </p>
                    <div className="max-h-[260px] overflow-y-auto">
                      <div className="flex flex-wrap gap-2">
                        {room.discard_pile.length === 0 ? (
                          <div className="w-32 h-44 border-4 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                            <span className="text-gray-400 text-sm text-center">まだカードは出ていません</span>
                          </div>
                        ) : (
                          room.discard_pile.map((card, index) => (
                            <Card
                              key={`discard-${card}-${index}`}
                              text={card}
                              variant="small"
                              disabled
                            />
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {rightPlayer && (
              <div className="flex justify-center lg:w-1/4">
                <PlayerArea
                  player={rightPlayer.player}
                  position="right"
                  isCurrentTurn={rightPlayer.player.player_number === room.current_turn_player}
                  onCardClick={
                    rightPlayer.player.id === currentPlayerId && isMyTurn && hasDrawn && (turnPhase === 'choose_card' || turnPhase === 'decide')
                      ? (cardIndex) => {
                          setSelectedHandCard(cardIndex);
                          discardCard(cardIndex);
                        }
                      : undefined
                  }
                  selectedCardIndex={selectedHandCard ?? undefined}
                  lastDrawnCardInstance={rightPlayer.player.player_number === room.current_turn_player ? lastDrawnCardInstance : null}
                  displayHand={rightPlayer.player.id === currentPlayerId ? effectiveHand : undefined}
                  guidanceText={rightPlayer.player.player_number === room.current_turn_player && hasDrawn && (turnPhase === 'decide' || turnPhase === 'choose_card') ? '手札の中から、場に出すカードを1枚選んでクリックしてください。' : undefined}
                />
              </div>
            )}
          </div>

          {bottomPlayer && (
            <div className="flex justify-center">
              <PlayerArea
                player={bottomPlayer.player}
                position="bottom"
                isCurrentTurn={bottomPlayer.player.player_number === room.current_turn_player}
                onCardClick={
                  bottomPlayer.player.id === currentPlayerId && isMyTurn && hasDrawn && (turnPhase === 'choose_card' || turnPhase === 'decide')
                    ? (cardIndex) => {
                        setSelectedHandCard(cardIndex);
                        discardCard(cardIndex);
                      }
                    : undefined
                }
                selectedCardIndex={selectedHandCard ?? undefined}
                lastDrawnCardInstance={bottomPlayer.player.player_number === room.current_turn_player ? lastDrawnCardInstance : null}
                displayHand={bottomPlayer.player.id === currentPlayerId ? effectiveHand : undefined}
                guidanceText={bottomPlayer.player.player_number === room.current_turn_player && hasDrawn && (turnPhase === 'decide' || turnPhase === 'choose_card') ? '手札の中から、場に出すカードを1枚選んでクリックしてください。' : undefined}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
