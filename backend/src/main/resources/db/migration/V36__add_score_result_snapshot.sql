-- Keep the original response with the score in its finish transaction. Existing scores retain
-- NULL: historical balances, levels and reward details cannot safely be reconstructed.
ALTER TABLE scores ADD COLUMN result_snapshot TEXT;
