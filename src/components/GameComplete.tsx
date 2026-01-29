import { Trophy, Heart, Gift as GiftIcon } from 'lucide-react';
import { Player, Gift } from '../lib/supabase';
import { deduplicateHandStrings } from '../lib/gameUtils';
import { Card } from './Card';

interface GameCompleteProps {
  players: Player[];
  gifts: Gift[];
  purposeCard: string;
}

export function GameComplete({ players, gifts, purposeCard }: GameCompleteProps) {
  const activePlayers = players.filter(p => p.role === 'player').sort((a, b) => a.player_number - b.player_number);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-white p-4">
      <div className="max-w-6xl mx-auto py-8">
        <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-gray-200 mb-6">
          <div className="text-center mb-8">
            <Trophy className="w-20 h-20 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-4xl font-bold text-gray-800 mb-4">
              今日の対話のまとめ
            </h2>

            <div className="bg-gradient-to-br from-blue-50 to-green-50 p-6 rounded-xl border-2 border-blue-200 inline-block">
              <p className="text-lg text-gray-700 mb-2">今回のテーマ</p>
              <p className="text-3xl font-bold text-gray-800">{purposeCard}</p>
            </div>
          </div>

          <div className="mb-8">
            <div className="flex items-center justify-center gap-3 mb-6">
              <Heart className="w-8 h-8 text-green-600" />
              <h3 className="text-2xl font-bold text-gray-800">響き合いとメッセージの記録</h3>
            </div>

            <div className="space-y-6">
              {activePlayers.map((player, index) => {
                const displayName = player.preferred_name || player.name;
                const gifts = player.final_gifts_received || [];

                return (
                  <div key={player.id} className="bg-gradient-to-br from-gray-50 to-blue-50 p-6 rounded-xl border-2 border-gray-200">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">
                        {index + 1}
                      </div>
                      <h4 className="text-xl font-bold text-gray-800">{displayName}さん</h4>
                    </div>

                    <div className="bg-white p-4 rounded-lg border-2 border-gray-200 mb-4 text-center">
                      <span className="text-sm font-medium text-gray-600 block mb-2">響き合いのマッチ度</span>
                      <span className="text-4xl font-bold text-blue-600">
                        {player.final_resonance_percentage ?? 50}%
                      </span>
                    </div>

                    <div className="mb-4">
                      <p className="text-sm font-medium text-gray-700 mb-3">集めたカード</p>
                      <div className="flex flex-wrap gap-3 justify-center">
                        {(player.hand?.length
                          ? deduplicateHandStrings(player.hand).map((card, cardIndex) => (
                              <Card key={`${player.id}-${card}-${cardIndex}`} text={card} disabled />
                            ))
                          : null) ?? <p className="text-gray-500 text-sm">手札データがありません</p>}
                      </div>
                    </div>

                    {gifts.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                          <GiftIcon className="w-4 h-4 text-green-600" />
                          受け取ったメッセージ
                        </p>
                        <div className="grid md:grid-cols-3 gap-3">
                          {gifts.map((gift: any, giftIndex: number) => (
                            <div key={giftIndex} className="bg-white p-3 rounded-lg border-2 border-blue-200 shadow-sm">
                              <p className="text-xs font-medium text-gray-600 mb-2">
                                {gift.from_player_name}さんから
                              </p>
                              <p className="text-sm text-gray-800 whitespace-pre-wrap">
                                {gift.message}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-gray-50 p-6 rounded-xl border-2 border-gray-200 mb-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-lg text-center">
                <p className="text-sm text-gray-600 mb-2">参加プレイヤー</p>
                <p className="text-3xl font-bold text-blue-600">{activePlayers.length}</p>
              </div>

              <div className="bg-white p-4 rounded-lg text-center">
                <p className="text-sm text-gray-600 mb-2">贈られたメッセージ</p>
                <p className="text-3xl font-bold text-green-600">
                  {activePlayers.reduce((sum, p) => sum + (p.final_gifts_received?.length || 0), 0)}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 bg-gradient-to-br from-blue-50 to-green-50 rounded-xl border-2 border-blue-200 text-center">
            <p className="text-gray-800 font-medium text-lg mb-2">
              お疲れさまでした！
            </p>
            <p className="text-gray-700">
              このゲームを通じて、お互いの価値観を共有し、<br />
              対話を深めることができました。<br />
              今日の気付きが、メンバー全員のわくわくといきいきに繋がることを祈っています。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
