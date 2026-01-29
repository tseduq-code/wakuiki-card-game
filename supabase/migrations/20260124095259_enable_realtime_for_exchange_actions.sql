/*
  # Enable Realtime for exchange_actions Table

  1. Purpose
    - Enables real-time replication for the exchange_actions table
    - Ensures card exchange actions are broadcast to all connected clients in real-time

  2. Tables Affected
    - exchange_actions

  3. Notes
    - This is idempotent - safe to run multiple times
*/

DO $$
BEGIN
  -- Enable realtime for exchange_actions
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'exchange_actions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE exchange_actions;
  END IF;
END $$;
