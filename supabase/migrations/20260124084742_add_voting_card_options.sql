/*
  # Add voting card options to game rooms

  1. Changes
    - Add `card_options` column to `game_rooms` table to store the 3 purpose cards for voting
    - Add `card_text` column to `votes` table to store the actual card text voted for
    - These changes ensure voting cards remain consistent throughout the voting phase

  2. Notes
    - card_options stores an array of 3 card strings
    - card_text in votes stores the actual card text to preserve voting data
*/

-- Add card_options column to game_rooms
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_rooms' AND column_name = 'card_options'
  ) THEN
    ALTER TABLE game_rooms ADD COLUMN card_options text[] DEFAULT '{}';
  END IF;
END $$;

-- Add card_text column to votes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'votes' AND column_name = 'card_text'
  ) THEN
    ALTER TABLE votes ADD COLUMN card_text text;
  END IF;
END $$;
