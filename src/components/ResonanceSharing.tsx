import { useState, useEffect } from 'react';
import { Heart } from 'lucide-react';
import { supabase, Player, ResonanceShare } from '../lib/supabase';
import { deduplicateHandStrings } from '../lib/gameUtils';
import { Card } from './Card';

interface ResonanceSharingProps {
  roomId: string;
  playerId: string;
  players: Player[];
  phase: 'initial' | 'final';
  purposeCard: string;
  resonanceShares: ResonanceShare[];
  onComplete?: () => void;
}

export function ResonanceSharing({
  roomId,
  playerId,
  players,
  phase,
  purposeCard,
  resonanceShares,
  onComplete
}: ResonanceSharingProps) {
  const [percentage, setPercentage] = useState<number>(50);
  const [submitted, setSubmitted] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Filter active players: must be 'player' role AND have a hand (exclude spectators and disconnected players)
  const activePlayers = players.filter(p => 
    p.role === 'player' && 
    p.hand && 
    p.hand.length > 0
  );
  const currentPlayerShares = resonanceShares.filter(s => s.phase === phase);
  const hasSubmitted = currentPlayerShares.some(s => s.player_id === playerId);

  // Reset submitted state when shares update
  useEffect(() => {
    if (hasSubmitted) {
      setSubmitted(true);
    }
  }, [hasSubmitted]);

  // Debug: Log component mount and critical data
  useEffect(() => {
    console.info('🎨 [ResonanceSharing] コンポーネントマウント/更新:', {
      roomId,
      playerId,
      phase,
      hasSubmitted,
      submitted
    });
  }, [roomId, playerId, phase, hasSubmitted, submitted]);

  // Debug: Log resonance shares updates with detailed info
  useEffect(() => {
    console.info('📊 [ResonanceSharing] resonanceShares更新:', {
      phase,
      roomId,
      total: resonanceShares.length,
      currentPhase: currentPlayerShares.length,
      activePlayers: activePlayers.length,
      players: players.length,
      allShares: resonanceShares.map(s => ({
        player_id: s.player_id,
        phase: s.phase,
        percentage: s.percentage
      })),
      filteredShares: currentPlayerShares.map(s => ({
        player_id: s.player_id,
        phase: s.phase,
        percentage: s.percentage
      })),
      playersWithHand: activePlayers.map(p => ({
        id: p.id,
        name: p.preferred_name || p.name,
        hasHand: !!(p.hand && p.hand.length > 0),
        handCount: p.hand?.length || 0
      }))
    });
  }, [resonanceShares]);

  async function submitResonance() {
    console.info('📝 [ResonanceSharing] 響き合い度を送信中:', { phase, percentage });

    const { data, error } = await supabase
      .from('resonance_shares')
      .upsert({
        room_id: roomId,
        player_id: playerId,
        phase,
        percentage
      }, {
        onConflict: 'room_id,player_id,phase'
      })
      .select();

    if (error) {
      console.error('❌ [ResonanceSharing] 送信エラー:', error);
    } else {
      console.info('✅ [ResonanceSharing] 送信成功:', data);
    }

    setSubmitted(true);
  }

  // Count only active players (with hands) who have submitted
  const activePlayerIds = new Set(activePlayers.map(p => p.id));
  const submittedActivePlayers = currentPlayerShares.filter(s => activePlayerIds.has(s.player_id));
  const allSubmitted = submittedActivePlayers.length >= activePlayers.length;
  
  const currentPlayer = players.find(p => p.id === playerId);
  const isLeader = currentPlayer?.player_number === 0;
  const isReady = currentPlayer?.ready_for_next_phase || false;
  const readyPlayers = players.filter(p => p.ready_for_next_phase && p.role === 'player');
  const allReady = readyPlayers.length >= activePlayers.length;
  
  // Leader can always proceed if majority (>= 3 out of 4) have submitted
  const majoritySubmitted = submittedActivePlayers.length >= Math.max(1, Math.ceil(activePlayers.length * 0.75));
  const canProceed = allSubmitted || (isLeader && majoritySubmitted);

  // Debug: Log current player's hand
  useEffect(() => {
    const player = players.find(p => p.id === playerId);
    console.info('🎴 [ResonanceSharing] 現在のプレイヤーの手札:', {
      playerId,
      playerName: player?.preferred_name || player?.name,
      hand: player?.hand,
      handLength: player?.hand?.length || 0,
      handExists: !!player?.hand
    });
  }, [players, playerId]);

  async function handleNextPhase() {
    if (isTransitioning) return;
    setIsTransitioning(true);

    try {
      // Mark this player as ready
      await supabase
        .from('players')
        .update({ ready_for_next_phase: true })
        .eq('id', playerId);

      // Check if all players are ready
      const { data: allPlayers } = await supabase
        .from('players')
        .select('ready_for_next_phase, role')
        .eq('room_id', roomId);

      const activePlayersInDb = allPlayers?.filter(p => p.role === 'player') || [];
      const allReadyInDb = activePlayersInDb.every(p => p.ready_for_next_phase);

      if (allReadyInDb) {
        // Reset ready flags for next phase
        await supabase
          .from('players')
          .update({ ready_for_next_phase: false })
          .eq('room_id', roomId);

        // Transition to next phase
        const nextStatus = phase === 'initial' ? 'playing' : 'gift_exchange';

        await supabase
          .from('game_rooms')
          .update({ status: nextStatus })
          .eq('id', roomId);
      }
    } catch (error) {
      console.error('Error transitioning to next phase:', error);
      setIsTransitioning(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-white p-4">
      {/* Sticky header with purpose card */}
      <div className="sticky top-0 z-10 bg-gradient-to-br from-green-50 via-blue-50 to-white pb-4 mb-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg p-4 border-2 border-blue-300">
            <div className="flex items-center justify-center gap-3">
              <Heart className="w-6 h-6 text-green-600 flex-shrink-0" />
              <div className="text-center">
                <p className="text-sm text-gray-600 font-medium">今回のテーマ</p>
                <p className="text-xl font-bold text-gray-800">{purposeCard}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-gray-200">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-800 mb-2">
              しっくり具合の共有
            </h2>
            <p className="text-gray-600 mb-4">
              このテーマに対して、いま目の前にある3枚のカードがどれくらい「しっくり来ているか」を、パーセンテージで表してみましょう。
              <br />
              カードはランダムに配られたものなので、正解や良し悪しはありません。なんとなくの感覚のままで大丈夫です。
            </p>
          </div>

          {!hasSubmitted && !submitted ? (
            <div className="mb-8">
              <div className="mb-6">
                <h3 className="font-bold text-lg text-gray-800 mb-4 text-center">あなたに配られたカード</h3>
                <div className="flex gap-4 justify-center">
                  {(() => {
                    const hand = players.find(p => p.id === playerId)?.hand;
                    if (!hand || hand.length === 0) {
                      return <p className="text-gray-500">手札を読み込み中...</p>;
                    }
                    return deduplicateHandStrings(hand).map((card, index) => (
                      <Card
                        key={`${playerId}-${card}-${index}`}
                        text={card}
                        disabled
                      />
                    ));
                  })()}
                </div>
              </div>
              <div className="bg-gray-50 p-6 rounded-xl border-2 border-gray-200">
                <label className="block text-center mb-4">
                  <span className="text-xl font-bold text-gray-800 block mb-2">
                    このテーマとの しっくり具合
                  </span>
                  <span className="text-5xl font-bold text-blue-600">{percentage}%</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={percentage}
                  onChange={(e) => setPercentage(Number(e.target.value))}
                  className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-sm text-gray-600 mt-2">
                  <span>0% ほとんどしっくり来ていない</span>
                  <span>100% とてもしっくり来ている</span>
                </div>
              </div>

              <button
                onClick={submitResonance}
                className="w-full mt-6 bg-blue-600 text-white py-4 px-6 rounded-lg font-bold text-lg hover:bg-blue-700 transition shadow-md hover:shadow-lg"
              >
                このしっくり具合を共有する
              </button>
            </div>
          ) : (
            <div className="mb-8">
              <div className="mb-6">
                <h3 className="font-bold text-lg text-gray-800 mb-4 text-center">あなたに配られたカード</h3>
                <div className="flex gap-4 justify-center">
                  {(() => {
                    const hand = players.find(p => p.id === playerId)?.hand;
                    if (!hand || hand.length === 0) {
                      return <p className="text-gray-500">手札を読み込み中...</p>;
                    }
                    return deduplicateHandStrings(hand).map((card, index) => (
                      <Card
                        key={`${playerId}-${card}-${index}`}
                        text={card}
                        disabled
                      />
                    ));
                  })()}
                </div>
              </div>
              <h3 className="font-bold text-xl text-gray-800 mb-4 text-center">
                全員のしっくり具合
              </h3>
              <div className="grid md:grid-cols-2 gap-4">
                {activePlayers.map((player) => {
                  const share = currentPlayerShares.find(s => s.player_id === player.id);
                  const displayName = player.preferred_name || player.name;
                  const hasHand = player.hand && player.hand.length > 0;

                  return (
                    <div
                      key={player.id}
                      className={`p-4 rounded-lg border-2 ${
                        share
                          ? 'bg-green-50 border-green-300'
                          : 'bg-gray-50 border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-medium text-gray-800">{displayName}</span>
                        {share ? (
                          <span className="text-2xl font-bold text-blue-600">{share.percentage}%</span>
                        ) : (
                          <span className="text-gray-400">入力中...</span>
                        )}
                      </div>

                      {share && hasHand && (
                        <div>
                          <p className="text-xs text-gray-600 mb-2 font-medium">その人に配られたカード</p>
                          <div className="flex gap-2 justify-center">
                            {deduplicateHandStrings(player.hand).map((card, index) => (
                              <Card
                                key={`${player.id}-${card}-${index}`}
                                text={card}
                                variant="small"
                                disabled
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {(canProceed || isLeader) && (
                <div className="mt-6 text-center">
                  {allSubmitted ? (
                    <p className="text-gray-600 mb-4">
                      全員のしっくり具合の共有が終わりました。感じたことを、安心できる範囲で言葉にしてみましょう。
                    </p>
                  ) : isLeader && majoritySubmitted ? (
                    <div className="mb-4">
                      <p className="text-gray-600 mb-2">
                        ほとんどのプレイヤーの共有が完了しました。
                      </p>
                      <p className="text-sm text-gray-500 mb-2">
                        ({submittedActivePlayers.length}/{activePlayers.length} 人が完了)
                      </p>
                      <p className="text-sm text-orange-600 font-medium">
                        リーダーとして、ゲームを開始できます。
                      </p>
                    </div>
                  ) : null}

                  {!isReady ? (
                    <div className="space-y-3">
                      <button
                        onClick={handleNextPhase}
                        disabled={isTransitioning}
                        className="bg-green-600 text-white py-3 px-8 rounded-lg font-bold hover:bg-green-700 transition shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isTransitioning ? '処理中...' : allSubmitted ? '次へ進む' : isLeader ? 'ゲームを開始する' : '次へ進む'}
                      </button>
                      {!allSubmitted && (
                        <p className="text-xs text-gray-500">
                          完了: {submittedActivePlayers.length}/{activePlayers.length} 人
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
                        <p className="text-green-700 font-bold mb-2">準備完了</p>
                        <p className="text-sm text-gray-600">
                          他のプレイヤーを待っています... ({readyPlayers.length}/{activePlayers.length})
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {activePlayers.map(player => (
                          <div
                            key={player.id}
                            className={`px-3 py-1 rounded-full text-sm font-medium ${
                              player.ready_for_next_phase
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {player.preferred_name || player.name}
                            {player.ready_for_next_phase && ' ✓'}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-gray-700 text-center">
              全員が入力し終わったら、しっくり具合について感じたことを順番にシェアしてみましょう
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
