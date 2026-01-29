/*
  # Enable Realtime Replication

  1. Purpose
    - Enables real-time replication for all game tables to ensure live updates work properly
    - This allows Supabase Realtime to broadcast database changes to connected clients

  2. Tables Affected
    - game_rooms
    - players
    - votes
    - resonance_shares
    - gifts

  3. Notes
    - Realtime replication must be enabled for postgres_changes subscriptions to work
    - This is idempotent - safe to run multiple times
*/

DO $$
BEGIN
  -- Enable realtime for game_rooms
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'game_rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE game_rooms;
  END IF;

  -- Enable realtime for players
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'players'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE players;
  END IF;

  -- Enable realtime for votes
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'votes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE votes;
  END IF;

  -- Enable realtime for resonance_shares
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'resonance_shares'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE resonance_shares;
  END IF;

  -- Enable realtime for gifts
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'gifts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE gifts;
  END IF;
END $$;
