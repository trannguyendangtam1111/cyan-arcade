-- Minesweeper Daily Board rewards: a won attempt earns XP and coins once, in the same transaction that
-- records the win. What it was paid is kept on the attempt, so a reload shows the same reward; the
-- coins are also in coin_transactions, referenced by the board's date, like every other coin.
-- Both stay NULL until a win has been rewarded, and only a won attempt can have them. Coins can be 0
-- when the day's paid games were used up before the win; the XP is paid all the same.
ALTER TABLE minesweeper_daily_attempts
    ADD COLUMN reward_xp INTEGER,
    ADD COLUMN reward_coins INTEGER,
    ADD CONSTRAINT ck_minesweeper_daily_attempts_reward CHECK (
        (reward_xp IS NULL AND reward_coins IS NULL)
        OR (status = 'WON' AND reward_xp >= 0 AND reward_coins >= 0));
