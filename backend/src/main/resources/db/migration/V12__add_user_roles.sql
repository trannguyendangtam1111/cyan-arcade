-- Roles. Every account has exactly one: USER (every player) or ADMIN. Spring Security sees them as
-- the authorities ROLE_USER and ROLE_ADMIN. Existing accounts are players.
--
-- The admin account itself is not created here: its password must be hashed by the application's
-- password encoder and can be configured, so it is seeded at startup (auth.AdminAccountSeeder).
ALTER TABLE users
    ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'USER',
    ADD CONSTRAINT ck_users_role CHECK (role IN ('USER', 'ADMIN'));
