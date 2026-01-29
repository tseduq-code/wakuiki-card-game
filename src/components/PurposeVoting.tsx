import { useState, useEffect, useRef } from 'react';
import { Vote as VoteIcon, CheckCircle } from 'lucide-react';
import { supabase, Player, Vote, GameRoom } from '../lib/supabase';
import { Card } from './Card';
import { dealInitialHands } from '../lib/gameUtils';

const VOTING_DURATION_SECONDS = 180;

interface PurposeVotingProps {
  roomId: string;
  playerId: string;
  players: Player[];
  votes: Vote[];
  room: GameRoom;
}

export function PurposeVoting({ roomId, playerId, players, votes, room }: PurposeVotingProps) {
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const decisionAttempted = useRef(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const activePlayers = players.filter(p => p.role !== 'spectator');
  const spectators = players.filter(p => p.role === 'spectator');
  const isSpectator = spectators.some(s => s.id === playerId);
  const hasVoted = votes.some(v => v.player_id === playerId);
  const allVoted = votes.length === activePlayers.length;
  const cardOptions = room.card_options || [];
  const votingStartedAt = room.voting_started_at ?? null;

  const isUnanimous =
    allVoted &&
    votes.length > 0 &&
    votes.every(v => v.card_index === votes[0].card_index);

  console.info('🗳️ [PurposeVoting] 投票状況:', votes.length, '/', activePlayers.length);

  // Set up shared 3-minute countdown timer
  useEffect(() => {
    if (room.status !== 'voting') return;

    let intervalId: number | undefined;
    let cancelled = false;

    const initializeTimer = async () => {
      try {
        let startTimestamp = votingStartedAt ? new Date(votingStartedAt).getTime() : Date.now();

        // If voting_started_at is not yet stored, try to persist it so everyone shares the same timer.
        if (!votingStartedAt) {
          try {
            const nowIso = new Date(startTimestamp).toISOString();
            const { data, error } = await supabase
              .from('game_rooms')
              .update({ voting_started_at: nowIso })
              .eq('id', roomId)
              .eq('status', 'voting')
              // Only set if still null to avoid races. If the column doesn't exist, this will just fail and we fall back to client-only timer.
              .is('voting_started_at', null)
              .select('voting_started_at')
              .maybeSingle();

            if (!error && data?.voting_started_at) {
              startTimestamp = new Date(data.voting_started_at).getTime();
            }
          } catch (err) {
            console.warn('⚠️ [PurposeVoting] voting_started_at の保存に失敗しましたが、クライアント側タイマーで継続します', err);
          }
        }

        const updateTime = () => {
          if (cancelled) return;
          const now = Date.now();
          const elapsedSeconds = Math.floor((now - startTimestamp) / 1000);
          const remaining = Math.max(0, VOTING_DURATION_SECONDS - elapsedSeconds);
          setTimeLeft(remaining);
        };

        updateTime();
        intervalId = window.setInterval(updateTime, 1000);
      } catch (err) {
        console.error('❌ [PurposeVoting] タイマー初期化エラー:', err);
      }
    };

    void initializeTimer();

    return () => {
      cancelled = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [roomId, room.status, votingStartedAt]);

  // If everyone has voted and all chose the same card, decide immediately
  useEffect(() => {
    if (isUnanimous && !decisionAttempted.current) {
      decisionAttempted.current = true;
      console.info('✅ [PurposeVoting] 全員の気持ちがそろいました。即時にテーマを確定します');
      handleAutoDecision();
    }
  }, [isUnanimous]);

  // If everyone has voted (regardless of unanimity), decide immediately without waiting for timer
  useEffect(() => {
    if (allVoted && !decisionAttempted.current && !isUnanimous) {
      decisionAttempted.current = true;
      console.info('✅ [PurposeVoting] 全員の投票が完了しました。即時にテーマを確定します');
      handleAutoDecision();
    }
  }, [allVoted, isUnanimous]);

  // When the 3-minute timer ends (and voting is not complete), decide by majority
  useEffect(() => {
    if (timeLeft === null) return;
    if (timeLeft > 0) return;
    if (decisionAttempted.current) return;
    if (allVoted) return; // Skip if everyone already voted (handled by the effect above)

    decisionAttempted.current = true;
    console.info('⏰ [PurposeVoting] 3分が経過しました。みなさんの投票をもとにテーマを確定します');
    handleAutoDecision();
  }, [timeLeft, allVoted]);

  async function submitVote() {
    if (selectedCard === null || submitting) return;

    console.info('🗳️ [PurposeVoting] 投票を送信中...', selectedCard);
    setSubmitting(true);

    try {
      const cardText = cardOptions[selectedCard];
      await supabase
        .from('votes')
        .insert({
          room_id: roomId,
          player_id: playerId,
          card_index: selectedCard,
          card_text: cardText
        });

      console.info('✅ [PurposeVoting] 投票を送信しました');
    } catch (err) {
      console.error('❌ [PurposeVoting] 投票送信エラー:', err);
      setSubmitting(false);
    }
  }

  async function handleAutoDecision() {
    try {
      console.info('📊 [PurposeVoting] 投票を集計中...');

      // Count votes for each card
      const voteCounts: Record<number, number> = {};
      votes.forEach(v => {
        voteCounts[v.card_index] = (voteCounts[v.card_index] || 0) + 1;
      });

      console.info('📊 [PurposeVoting] 投票結果:', voteCounts);

      // Find the card with the most votes.
      // If there's a tie, choose the one with the smallest index (deterministic).
      let maxVotes = 0;
      let winningCardIndex: number | null = null;

      const voteEntries = Object.entries(voteCounts);

      if (voteEntries.length === 0) {
        console.warn('⚠️ [PurposeVoting] 有効な投票がありません。最初のカードを選択します');
        winningCardIndex = 0;
      } else {
        voteEntries.forEach(([cardIndexStr, count]) => {
          const cardIndex = Number(cardIndexStr);
          if (
            winningCardIndex === null ||
            count > maxVotes ||
            (count === maxVotes && cardIndex < winningCardIndex)
          ) {
            maxVotes = count;
            winningCardIndex = cardIndex;
          }
        });
      }

      if (
        winningCardIndex === null ||
        winningCardIndex < 0 ||
        winningCardIndex >= cardOptions.length
      ) {
        console.warn('⚠️ [PurposeVoting] 集計結果が不正なため、最初のカードを選択します');
        winningCardIndex = 0;
      }

      const chosenCard = cardOptions[winningCardIndex];

      console.info('🎉 [PurposeVoting] 勝利カード:', chosenCard, '（得票数:', maxVotes, '）');

      // Check current status before updating
      const { data: currentRoom } = await supabase
        .from('game_rooms')
        .select('status')
        .eq('id', roomId)
        .single();

      if (currentRoom && currentRoom.status !== 'voting') {
        console.info('ℹ️ [PurposeVoting] 他のプレイヤーが既に決定を実行しました');
        return;
      }

      // Deal cards now after voting is complete
      console.info('🎴 [PurposeVoting] カードを配ります...');
      const { data: roomData } = await supabase
        .from('game_rooms')
        .select('deck')
        .eq('id', roomId)
        .single();

      if (!roomData) {
        console.error('❌ [PurposeVoting] ルーム情報が取得できません');
        return;
      }

      const { hands, remainingDeck } = dealInitialHands(roomData.deck);
      const sortedPlayers = [...activePlayers].sort((a, b) => a.player_number - b.player_number);

      console.info('🎴 [PurposeVoting] カード配分:', {
        playerHands: hands.length,
        cardsPerPlayer: hands[0]?.length,
        deckRemaining: remainingDeck.length,
        totalCards: (hands.length * 3) + remainingDeck.length
      });

      // Update players' hands in parallel
      const handUpdatePromises = sortedPlayers.map((player, i) =>
        supabase
          .from('players')
          .update({ hand: hands[i] })
          .eq('id', player.id)
      );

      await Promise.all(handUpdatePromises);
      console.info('✅ [PurposeVoting] 全プレイヤーへのカード配布完了');

      // Update room with winning card and transition to voting_result
      // discard_pile starts empty, deck has 12 cards remaining
      console.info('🔄 [PurposeVoting] ルームステータスを voting_result に更新します');
      const { error: updateError } = await supabase
        .from('game_rooms')
        .update({
          purpose_card: chosenCard,
          status: 'voting_result',
          discard_pile: [],
          deck: remainingDeck
        })
        .eq('id', roomId)
        .eq('status', 'voting');

      if (updateError) {
        console.error('❌ [PurposeVoting] ステータス更新エラー:', updateError);
        console.info('ℹ️ [PurposeVoting] 他のプレイヤーが既に結果を確定した可能性があります。追加の処理は行いません');
        return;
      }

      console.info('🎉 [PurposeVoting] 投票結果が確定しました！');
    } catch (err) {
      console.error('❌ [PurposeVoting] 自動決定エラー:', err);
    }
  }

  const formattedTimeLeft =
    timeLeft !== null
      ? `${String(Math.floor(timeLeft / 60)).padStart(2, '0')}:${String(timeLeft % 60).padStart(2, '0')}`
      : null;

  if (cardOptions.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-white flex items-center justify-center p-4">
        <div className="text-xl text-gray-600">カードを準備中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-white flex items-center justify-center p-4">
      <div className="max-w-6xl w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-gray-200">
          <div className="text-center mb-8">
            <VoteIcon className="w-12 h-12 text-blue-600 mx-auto mb-4" />
            <h2 className="text-3xl font-bold text-gray-800 mb-2">
              今日のテーマを、みんなで選びましょう 🌱
            </h2>
            <p className="text-gray-600">
              まずは3分ほど、自由にお話ししてみてください。
              <br />
              「これいいね」「今の気分はこっちかも」
              <br />
              そんな声を出し合いながら、みんながしっくりくる1枚を選べたら素敵です。
            </p>
            <p className="mt-4 text-sm text-gray-500">
              もし時間内に1枚にそろわなかったときは、みなさんの投票をもとに、この場で大切に選びます。
              <br />
              どんな結果になっても、ここからが本番です 🙂
            </p>
            {formattedTimeLeft && (
              <div className="mt-6 inline-flex flex-col items-center justify-center px-4 py-2 rounded-full bg-blue-50 border border-blue-200">
                <span className="text-sm font-medium text-blue-700">
                  のこり {formattedTimeLeft}　ゆっくり話してみましょう
                </span>
                {timeLeft !== null && timeLeft <= 30 && (
                  <span className="mt-1 text-xs text-orange-600">
                    そろそろ決め時かも…？
                  </span>
                )}
              </div>
            )}
          </div>

          {isSpectator ? (
            <div>
              <div className="mb-8 text-center">
                <p className="text-lg text-gray-600 mb-6">観戦モードです</p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
                  {cardOptions.map((card, index) => (
                    <div key={index} className="opacity-70">
                      <Card
                        text={card}
                        variant="purpose"
                        disabled
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <h3 className="font-bold text-lg text-gray-800 mb-2 text-center">
                  投票状況: {votes.length} / {activePlayers.length} 人完了
                </h3>
                <div className="w-full bg-gray-200 rounded-full h-3 mb-6">
                  <div
                    className="bg-green-500 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${(votes.length / activePlayers.length) * 100}%` }}
                  />
                </div>
                <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                  {activePlayers.map((player) => {
                    const voted = votes.some(v => v.player_id === player.id);
                    return (
                      <div
                        key={player.id}
                        className={`p-4 rounded-lg border-2 ${
                          voted
                            ? 'bg-green-50 border-green-300'
                            : 'bg-gray-50 border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {voted && <CheckCircle className="w-5 h-5 text-green-600" />}
                          <span className="font-medium text-gray-800">{player.name}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {allVoted && (
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 text-gray-600">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
                    <p>結果を集計中...</p>
                  </div>
                </div>
              )}

              {!allVoted && (
                <div className="text-center text-gray-600">
                  <p>プレイヤーの投票を待っています...</p>
                </div>
              )}
            </div>
          ) : !hasVoted ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8 max-w-5xl mx-auto">
                {cardOptions.map((card, index) => (
                  <div
                    key={index}
                    onClick={() => setSelectedCard(index)}
                    className={`cursor-pointer transform transition-all hover:scale-105 ${
                      selectedCard === index ? 'ring-4 ring-blue-500 rounded-xl' : ''
                    }`}
                  >
                    <Card
                      text={card}
                      variant="purpose"
                      selected={selectedCard === index}
                      onClick={() => {}}
                    />
                  </div>
                ))}
              </div>

              <div className="text-center">
                <button
                  onClick={submitVote}
                  disabled={selectedCard === null || submitting}
                  className="bg-blue-600 text-white py-3 px-8 rounded-lg font-bold text-lg hover:bg-blue-700 disabled:bg-gray-400 transition shadow-md hover:shadow-lg"
                >
                  {submitting ? '送信中...' : 'このカードにする'}
                </button>
              </div>
            </>
          ) : (
            <div>
              <div className="flex items-center justify-center gap-3 mb-6">
                <CheckCircle className="w-8 h-8 text-green-600" />
                <p className="text-xl font-medium text-gray-800">投票完了</p>
              </div>

              <div className="mb-6">
                <h3 className="font-bold text-lg text-gray-800 mb-2 text-center">
                  投票状況: {votes.length} / {activePlayers.length} 人完了
                </h3>
                <div className="w-full bg-gray-200 rounded-full h-3 mb-6">
                  <div
                    className="bg-green-500 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${(votes.length / activePlayers.length) * 100}%` }}
                  />
                </div>
                <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                  {activePlayers.map((player) => {
                    const voted = votes.some(v => v.player_id === player.id);
                    return (
                      <div
                        key={player.id}
                        className={`p-4 rounded-lg border-2 ${
                          voted
                            ? 'bg-green-50 border-green-300'
                            : 'bg-gray-50 border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {voted && <CheckCircle className="w-5 h-5 text-green-600" />}
                          <span className="font-medium text-gray-800">{player.name}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {allVoted && (
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 text-gray-600">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
                    <p>結果を集計中...</p>
                  </div>
                </div>
              )}

              {!allVoted && (
                <div className="text-center text-gray-600">
                  <p>他のプレイヤーの投票を待っています...</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
