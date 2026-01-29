import { Trophy } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { supabase, Vote } from '../lib/supabase';

interface VotingResultProps {
  roomId: string;
  purposeCard: string;
  votes: Vote[];
}

export function VotingResult({ roomId, purposeCard, votes }: VotingResultProps) {
  const transitionAttempted = useRef(false);
  const isUnanimous = votes.length > 0 && votes.every(v => v.card_text === purposeCard);
  const resultMessage = isUnanimous
    ? `みんなの気持ちがそろいました！今回のテーマは『${purposeCard}』に決まりました。`
    : `いろんな声の中から、このテーマに決まりました。今回のテーマは『${purposeCard}』です。ここから、それぞれの感じ方を大切にしていきましょう。`;

  useEffect(() => {
    console.info('🏆 [VotingResult] 投票結果を表示中:', purposeCard);

    // Auto-transition after 3 seconds
    const timer = setTimeout(() => {
      if (!transitionAttempted.current) {
        transitionAttempted.current = true;
        console.info('⏰ [VotingResult] 3秒経過 - resonance_initial フェーズに遷移します');
        transitionToResonance();
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [roomId]);

  async function transitionToResonance() {
    try {
      // Check current status before updating
      const { data: currentRoom } = await supabase
        .from('game_rooms')
        .select('status')
        .eq('id', roomId)
        .single();

      if (currentRoom && currentRoom.status !== 'voting_result') {
        console.info('ℹ️ [VotingResult] 他のプレイヤーが既に遷移しました');
        return;
      }

      console.info('🔄 [VotingResult] ルームステータスを resonance_initial に更新します');
      const { error } = await supabase
        .from('game_rooms')
        .update({ status: 'resonance_initial' })
        .eq('id', roomId)
        .eq('status', 'voting_result');

      if (error) {
        console.error('❌ [VotingResult] ステータス更新エラー:', error);

        // Check if someone else succeeded
        const { data: checkRoom } = await supabase
          .from('game_rooms')
          .select('status')
          .eq('id', roomId)
          .single();

        if (checkRoom?.status === 'resonance_initial') {
          console.info('ℹ️ [VotingResult] 他のプレイヤーが既に遷移しました');
          return;
        }

        throw error;
      }

      console.info('✅ [VotingResult] resonance_initial フェーズへの遷移完了');
    } catch (err) {
      console.error('❌ [VotingResult] 遷移エラー:', err);
      transitionAttempted.current = false;
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-white flex items-center justify-center p-4">
      <div className="max-w-3xl w-full">
        <div className="bg-white rounded-2xl shadow-xl p-12 border-2 border-gray-200 text-center">
          <Trophy className="w-20 h-20 text-yellow-500 mx-auto mb-6" />
          <h2 className="text-4xl font-bold text-gray-800 mb-6">
            今回のテーマが決まりました
          </h2>

          <div className="bg-gradient-to-br from-blue-50 to-green-50 p-8 rounded-xl border-2 border-blue-200 mb-8">
            <p className="text-3xl font-bold text-gray-800">{purposeCard}</p>
          </div>

          <p className="text-gray-600 mb-8 text-lg">
            {resultMessage}
          </p>

          <div className="flex items-center justify-center gap-2 text-gray-600">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
            <p>まもなく次のフェーズに移ります...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
